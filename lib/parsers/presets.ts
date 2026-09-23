/**
 * Bank-specific presets.
 *
 * Each preset declares:
 *  - detect(headers, sampleRows): does this file belong to this bank?
 *      `headers` is the located header row, lower-cased+trimmed (empty for
 *      headerless files); `sampleRows` is up to 5 raw following data rows
 *      (used for structural detection, e.g. HSBC).
 *  - parse(records): records keyed by ORIGINAL trimmed header names
 *      (or "col0".."colN" for headerless files) → normalised transactions.
 *
 * Presets that fail to produce a valid date or amount for a row simply omit
 * that row; the engine in index.ts compares input vs output counts to emit
 * skipped-row warnings, so per-preset code stays simple.
 */

import type { BankPreset, ParsedTransaction } from "@/lib/types";
import {
  parseAmountToPence,
  parseUkDate,
  parseTextMonthDate,
  parseIsoDate,
  stripQuotes,
  collapseWhitespace,
} from "./helpers";

/** True if every needle is present in the headers array. */
function hasAll(headers: string[], needles: string[]): boolean {
  return needles.every((n) => headers.includes(n));
}

/** Pick the first record value whose key matches (exact, case-insensitive). */
function field(rec: Record<string, string>, name: string): string {
  if (name in rec) return rec[name];
  const lower = name.toLowerCase();
  for (const key of Object.keys(rec)) {
    if (key.toLowerCase() === lower) return rec[key];
  }
  return "";
}

/**
 * Resolve a signed amount from a split debit/credit pair.
 * Debit = money out (negative), Credit = money in (positive).
 * Returns null only when BOTH are unparseable.
 */
function splitAmount(debitRaw: string, creditRaw: string): number | null {
  const debit = parseAmountToPence(debitRaw);
  const credit = parseAmountToPence(creditRaw);
  if (debit !== null && debit !== 0) return -Math.abs(debit);
  if (credit !== null && credit !== 0) return Math.abs(credit);
  // Both blank/zero/unparseable: treat a parseable 0 as a valid zero row.
  if (debit === 0 || credit === 0) return 0;
  return null;
}

// ---------------------------------------------------------------------------
// Monzo
// ---------------------------------------------------------------------------
const monzo: BankPreset = {
  id: "monzo",
  name: "Monzo",
  detect(headers) {
    return hasAll(headers, ["transaction id", "amount"]);
  },
  parse(records) {
    const out: ParsedTransaction[] = [];
    for (const rec of records) {
      const date = parseUkDate(field(rec, "Date"));
      const amountPence = parseAmountToPence(field(rec, "Amount"));
      if (date === null || amountPence === null) continue;
      const name = collapseWhitespace(field(rec, "Name"));
      const description = name || collapseWhitespace(field(rec, "Description"));
      out.push({ date, description, amountPence });
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Starling
// ---------------------------------------------------------------------------
const starling: BankPreset = {
  id: "starling",
  name: "Starling Bank",
  detect(headers) {
    return headers.includes("counter party");
  },
  parse(records) {
    const out: ParsedTransaction[] = [];
    for (const rec of records) {
      const date = parseUkDate(field(rec, "Date"));
      const amountPence = parseAmountToPence(field(rec, "Amount (GBP)"));
      if (date === null || amountPence === null) continue;
      const counterParty = collapseWhitespace(field(rec, "Counter Party"));
      const reference = collapseWhitespace(field(rec, "Reference"));
      let description = counterParty;
      if (reference) {
        description = description
          ? `${description} (${reference})`
          : reference;
      }
      out.push({ date, description, amountPence });
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Barclays
// ---------------------------------------------------------------------------
const barclays: BankPreset = {
  id: "barclays",
  name: "Barclays",
  detect(headers) {
    return hasAll(headers, ["subcategory", "memo"]);
  },
  parse(records) {
    const out: ParsedTransaction[] = [];
    for (const rec of records) {
      const date = parseUkDate(field(rec, "Date"));
      const amountPence = parseAmountToPence(field(rec, "Amount"));
      if (date === null || amountPence === null) continue;
      const description = collapseWhitespace(field(rec, "Memo"));
      out.push({ date, description, amountPence });
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Lloyds / Halifax / Bank of Scotland / TSB — split debit/credit
// ---------------------------------------------------------------------------
const lloyds: BankPreset = {
  id: "lloyds",
  name: "Lloyds / Halifax / Bank of Scotland / TSB",
  detect(headers) {
    return hasAll(headers, [
      "transaction date",
      "transaction description",
      "debit amount",
      "credit amount",
    ]);
  },
  parse(records) {
    const out: ParsedTransaction[] = [];
    for (const rec of records) {
      const date = parseUkDate(field(rec, "Transaction Date"));
      const amountPence = splitAmount(
        field(rec, "Debit Amount"),
        field(rec, "Credit Amount"),
      );
      if (date === null || amountPence === null) continue;
      const description = collapseWhitespace(field(rec, "Transaction Description"));
      out.push({ date, description, amountPence });
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// NatWest / RBS — single signed Value, apostrophe-wrapped descriptions
// ---------------------------------------------------------------------------
const natwest: BankPreset = {
  id: "natwest",
  name: "NatWest / RBS",
  detect(headers) {
    // "Date, Type, Description, Value, Balance, Account Name, Account Number"
    // (often with a trailing empty column). Distinguish from other single-
    // "Value" banks by requiring the account-name/number pair too.
    return (
      headers.includes("value") &&
      headers.includes("description") &&
      headers.includes("account name") &&
      headers.includes("account number")
    );
  },
  parse(records) {
    const out: ParsedTransaction[] = [];
    for (const rec of records) {
      const date = parseUkDate(field(rec, "Date"));
      const amountPence = parseAmountToPence(field(rec, "Value"));
      if (date === null || amountPence === null) continue;
      const description = collapseWhitespace(stripQuotes(field(rec, "Description")));
      out.push({ date, description, amountPence });
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Nationwide — preamble lines, textual months, split Paid out / Paid in, £ signs
// ---------------------------------------------------------------------------
const nationwide: BankPreset = {
  id: "nationwide",
  name: "Nationwide",
  detect(headers) {
    return hasAll(headers, [
      "transaction type",
      "description",
      "paid out",
      "paid in",
    ]);
  },
  parse(records) {
    const out: ParsedTransaction[] = [];
    for (const rec of records) {
      // Both "29 Dec 2026" and "29-Dec-26" variants.
      const date =
        parseTextMonthDate(field(rec, "Date")) ?? parseUkDate(field(rec, "Date"));
      // Amounts carry "£" which parseAmountToPence strips.
      const amountPence = splitAmount(
        field(rec, "Paid out"),
        field(rec, "Paid in"),
      );
      if (date === null || amountPence === null) continue;
      const description = collapseWhitespace(field(rec, "Description"));
      out.push({ date, description, amountPence });
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Revolut — completed-date, fee subtraction, COMPLETED/GBP filtering
// ---------------------------------------------------------------------------
const revolut: BankPreset = {
  id: "revolut",
  name: "Revolut",
  detect(headers) {
    return (
      headers.includes("product") &&
      headers.includes("completed date") &&
      headers.includes("state")
    );
  },
  parse(records) {
    const out: ParsedTransaction[] = [];
    for (const rec of records) {
      const state = field(rec, "State").trim().toUpperCase();
      if (state !== "COMPLETED") continue;
      const currency = field(rec, "Currency").trim().toUpperCase();
      if (currency !== "GBP") continue;

      const date =
        parseIsoDate(field(rec, "Completed Date")) ??
        parseIsoDate(field(rec, "Started Date"));
      const amount = parseAmountToPence(field(rec, "Amount"));
      if (date === null || amount === null) continue;

      // Fee is a positive charge; effective amount = Amount - Fee.
      const fee = parseAmountToPence(field(rec, "Fee")) ?? 0;
      const amountPence = amount - Math.abs(fee);

      const description = collapseWhitespace(field(rec, "Description"));
      out.push({ date, description, amountPence });
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// HSBC — NO header row, structural 3-column detection
// ---------------------------------------------------------------------------
const hsbc: BankPreset = {
  id: "hsbc",
  name: "HSBC",
  detect(headers, sampleRows) {
    // Only consider when there's no recognised header row. The engine passes
    // headers=[] on the headerless path; if a non-empty header sneaks in here,
    // require it not to look like real column titles.
    if (headers.length > 0) return false;
    if (sampleRows.length === 0) return false;
    let valid = 0;
    for (const row of sampleRows) {
      if (row.length !== 3) return false;
      const date = parseUkDate(row[0]);
      const amount = parseAmountToPence(row[2]);
      if (date !== null && amount !== null) valid++;
    }
    return valid > 0;
  },
  parse(records) {
    const out: ParsedTransaction[] = [];
    for (const rec of records) {
      const date = parseUkDate(field(rec, "col0"));
      const amountPence = parseAmountToPence(field(rec, "col2"));
      if (date === null || amountPence === null) continue;
      const description = collapseWhitespace(field(rec, "col1"));
      out.push({ date, description, amountPence });
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// American Express — single column, INVERTED sign (positive = spend). LAST.
// ---------------------------------------------------------------------------
const amex: BankPreset = {
  id: "amex",
  name: "American Express",
  detect(headers) {
    // Header is "Date, Description, Amount" (possibly with extra trailing
    // columns). Detected last, so anything more specific wins first.
    return (
      headers.length >= 3 &&
      headers[0] === "date" &&
      headers[1] === "description" &&
      headers[2] === "amount"
    );
  },
  parse(records) {
    const out: ParsedTransaction[] = [];
    for (const rec of records) {
      const date = parseUkDate(field(rec, "Date"));
      const raw = parseAmountToPence(field(rec, "Amount"));
      if (date === null || raw === null) continue;
      // Amex exports positive = spend → invert so spend is negative.
      const amountPence = -raw;
      const description = collapseWhitespace(field(rec, "Description"));
      out.push({ date, description, amountPence });
    }
    return out;
  },
};

/**
 * Detection order matters: more specific presets first, Amex last so its very
 * loose "date/description/amount" signature never shadows a real bank.
 */
export const PRESETS: BankPreset[] = [
  monzo,
  starling,
  barclays,
  lloyds,
  natwest,
  nationwide,
  revolut,
  hsbc,
  amex,
];
