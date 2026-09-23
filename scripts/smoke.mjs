/**
 * End-to-end smoke test against a running server.
 * Usage: node scripts/smoke.mjs [baseUrl]
 */
import { readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3100";
let failures = 0;

function check(name, cond, detail = "") {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

const monzoCsv = readFileSync("samples/monzo-sample.csv", "utf8");
const lloydsCsv = readFileSync("samples/lloyds-sample.csv", "utf8");
const nwCsv = readFileSync("samples/nationwide-sample.csv", "utf8");
const hsbcCsv = readFileSync("samples/hsbc-sample.csv", "utf8");

// ---------- 1. Preset auto-detection on every sample ----------
console.log("\n[1] Preset auto-detection");
const detections = [
  ["monzo", monzoCsv],
  ["lloyds", lloydsCsv],
  ["nationwide", nwCsv],
  ["hsbc", hsbcCsv],
];
const previews = {};
for (const [expected, csv] of detections) {
  const { status, json } = await api("POST", "/api/import/preview", {
    csvText: csv,
    accountName: `Smoke ${expected}`,
    accountType: "current",
  });
  previews[expected] = json;
  check(`${expected}: preview 200`, status === 200, JSON.stringify(json?.error ?? json).slice(0, 200));
  check(`${expected}: detected`, json?.presetId === expected, `got ${json?.presetId}`);
  check(`${expected}: rows parsed`, (json?.rows?.length ?? 0) >= 10, `got ${json?.rows?.length}`);
  check(`${expected}: no warnings`, (json?.warnings?.length ?? 1) === 0, JSON.stringify(json?.warnings));
}

// ---------- 2. Categorisation hit rate on Monzo sample ----------
console.log("\n[2] Auto-categorisation");
const mz = previews.monzo;
const hits = mz.rows.filter((r) => r.categoryName !== null);
check(
  "≥70% of sample rows auto-categorised",
  hits.length / mz.rows.length >= 0.7,
  `${hits.length}/${mz.rows.length}`
);
check(
  "amounts are signed pence ints",
  mz.rows.every((r) => Number.isInteger(r.amountPence)),
);
check("dates ISO yyyy-MM-dd", mz.rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date)));

// ---------- 3. Commit, then dedupe idempotency ----------
console.log("\n[3] Commit + dedupe idempotency");
const commitRows = mz.rows
  .filter((r) => !r.duplicate)
  .map((r) => ({
    date: r.date,
    description: r.description,
    merchant: r.merchant,
    categoryName: r.categoryName,
    categorySource: r.categorySource,
    amountPence: r.amountPence,
  }));
const c1 = await api("POST", "/api/import/commit", {
  accountId: mz.accountId,
  source: "Monzo",
  rows: commitRows,
});
check("first commit 200", c1.status === 200, JSON.stringify(c1.json).slice(0, 200));
check("all rows inserted", c1.json?.inserted === commitRows.length, JSON.stringify(c1.json));

const re = await api("POST", "/api/import/preview", {
  csvText: monzoCsv,
  accountName: "Smoke monzo",
});
check(
  "re-preview: every row flagged duplicate",
  re.json?.rows?.every((r) => r.duplicate) === true,
  `${re.json?.rows?.filter((r) => r.duplicate).length}/${re.json?.rows?.length} dupes`
);
const c2 = await api("POST", "/api/import/commit", {
  accountId: mz.accountId,
  source: "Monzo",
  rows: commitRows,
});
check("re-commit inserts 0", c2.json?.inserted === 0, JSON.stringify(c2.json));
check(
  "re-commit skips all as dupes",
  c2.json?.skippedDuplicates === commitRows.length,
  JSON.stringify(c2.json)
);

// ---------- 4. Transactions list ----------
console.log("\n[4] Transactions API");
const tx = await api("GET", "/api/transactions?limit=5");
check("list 200 with rows", tx.status === 200 && tx.json?.transactions?.length > 0);
check("total >= inserted", tx.json?.total >= commitRows.length, `total=${tx.json?.total}`);
const sample = tx.json.transactions[0];
check(
  "TxnDTO shape",
  typeof sample.id === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(sample.date) &&
    Number.isInteger(sample.amountPence) &&
    "category" in sample &&
    "account" in sample
);
const uncat = await api("GET", "/api/transactions?uncategorized=true&limit=50");
check("uncategorized filter 200", uncat.status === 200);
check(
  "uncategorized rows have null category",
  (uncat.json?.transactions ?? []).every((t) => t.category === null)
);

// ---------- 5. Manual tag + rule creation ----------
console.log("\n[5] Manual tagging + rules");
if ((uncat.json?.transactions?.length ?? 0) > 0) {
  const target = uncat.json.transactions[0];
  const cats = (await api("GET", "/api/categories")).json;
  const shopping = cats.find((c) => c.name === "Shopping");
  const patched = await api("PATCH", `/api/transactions/${target.id}`, {
    categoryId: shopping.id,
    createRule: {
      pattern: (target.merchant || target.description).toUpperCase().trim(),
      applyToExisting: true,
    },
  });
  check("PATCH with createRule 200", patched.status === 200, JSON.stringify(patched.json).slice(0, 200));
  check("categorySource manual", patched.json?.categorySource === "manual");
  const rules = await api("GET", "/api/rules");
  check("rule persisted", rules.json?.length >= 1, `rules=${rules.json?.length}`);
} else {
  console.log("  SKIP  (no uncategorised rows in sample — dictionary got everything)");
}

// ---------- 6. Budgets + stats ----------
console.log("\n[6] Budgets + stats");
const cats = (await api("GET", "/api/categories")).json;
const groceries = cats.find((c) => c.name === "Groceries");
const put = await api("PUT", "/api/budgets", {
  budgets: [{ categoryId: groceries.id, amountPence: 40000 }],
});
check("budgets PUT 200", put.status === 200, JSON.stringify(put.json).slice(0, 200));

// Sample dates span Apr-Jun 2026; stats month = a month with data
const monthWithData = mz.rows[0].date.slice(0, 7);
const stats = await api("GET", `/api/stats?month=${monthWithData}`);
const s = stats.json;
check("stats 200", stats.status === 200, JSON.stringify(s?.error ?? "").slice(0, 200));
check("totalSpend > 0", s?.totalSpendPence > 0, `spend=${s?.totalSpendPence}`);
check("byCategory non-empty", (s?.byCategory?.length ?? 0) > 0);
check("trend has 12 points", s?.trend?.length === 12, `got ${s?.trend?.length}`);
check(
  "budget progress present",
  s?.budgets?.some((b) => b.categoryId === groceries.id),
  JSON.stringify(s?.budgets)
);
const transferSlice = s?.byCategory?.find((c) => c.name === "Transfers");
check("transfers excluded from byCategory", transferSlice === undefined, JSON.stringify(transferSlice));
check(
  "net = income - spend",
  s?.netPence === s?.totalIncomePence - s?.totalSpendPence
);

// ---------- 7. Generic mapper (Santander-style) ----------
console.log("\n[7] Generic column mapper");
const genericCsv = [
  "Posting Date,Details,Money Out,Money In,Running Balance",
  "01/06/2026,CARD PAYMENT TO TESCO STORES,12.50,,1000.00",
  "02/06/2026,SALARY ACME LTD,,2500.00,3487.50",
].join("\n");
const gen = await api("POST", "/api/import/preview", {
  csvText: genericCsv,
  accountName: "Smoke generic",
  mapping: {
    dateColumn: "Posting Date",
    descriptionColumn: "Details",
    debitColumn: "Money Out",
    creditColumn: "Money In",
    dateFormat: "dmy",
  },
});
check("generic preview 200", gen.status === 200, JSON.stringify(gen.json?.error ?? "").slice(0, 200));
check("generic: 2 rows", gen.json?.rows?.length === 2, `got ${gen.json?.rows?.length}`);
check(
  "generic: debit negative, credit positive",
  gen.json?.rows?.[0]?.amountPence === -1250 && gen.json?.rows?.[1]?.amountPence === 250000,
  JSON.stringify(gen.json?.rows?.map((r) => r.amountPence))
);
check("generic: Tesco categorised", gen.json?.rows?.[0]?.categoryName === "Groceries");

// ---------- 8. Unknown CSV falls back gracefully ----------
console.log("\n[8] Unknown format fallback");
const unk = await api("POST", "/api/import/preview", {
  csvText: "a,b\n1,2\n3,4",
  accountName: "Smoke unknown",
});
check("unknown: presetId unknown", unk.json?.presetId === "unknown", `got ${unk.json?.presetId}`);
check("unknown: headers returned for mapper", (unk.json?.headers?.length ?? 0) > 0);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
