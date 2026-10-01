import { NextResponse } from "next/server";
import { requireHousehold, householdAccessError, withRlsUser } from "@/lib/auth/household";
import { buildImportHash, contentHash } from "@/lib/import-hash";
import { loadExistingImportCounts } from "@/lib/import-dedupe";
import type { CommitRequest, CommitResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const context = await requireHousehold();
    if (!context.membership) {
      return NextResponse.json(householdAccessError(context.status), { status: context.status });
    }
    const householdId = context.membership.householdId;
    return await withRlsUser(context.userId, async (tx) => {
    const body = (await req.json()) as CommitRequest;

    if (typeof body.accountId !== "string" || body.accountId === "") {
      return NextResponse.json(
        { error: "accountId is required" },
        { status: 400 }
      );
    }
    if (!Array.isArray(body.rows)) {
      return NextResponse.json(
        { error: "rows array is required" },
        { status: 400 }
      );
    }

    const account = await tx.account.findUnique({
      where: { id: body.accountId },
    });
    if (!account || account.householdId !== householdId) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    const source = typeof body.source === "string" ? body.source : "manual";

    // Map categoryName → categoryId via one upfront name-keyed lookup.
    const wantedNames = Array.from(
      new Set(
        body.rows
          .map((r) => r.categoryName)
          .filter((n): n is string => typeof n === "string" && n !== "")
      )
    );
    const categories =
      wantedNames.length > 0
        ? await tx.category.findMany({
            where: { name: { in: wantedNames }, householdId },
            select: { id: true, name: true },
          })
        : [];
    const nameToId = new Map<string, string>();
    for (const c of categories) nameToId.set(c.name, c.id);

    // Group incoming rows by recomputed content hash (NEVER trust client hashes).
    const groups = new Map<
      string,
      { row: CommitRequest["rows"][number]; hash: string }[]
    >();
    for (const row of body.rows) {
      const hash = contentHash(account.id, {
        date: row.date,
        description: row.description,
        amountPence: row.amountPence,
      });
      const arr = groups.get(hash);
      const entry = { row, hash };
      if (arr) arr.push(entry);
      else groups.set(hash, [entry]);
    }

    // Read existing hashes in bounded batches instead of issuing one count
    // query per transaction row.
    const existingCounts = await loadExistingImportCounts(
      Array.from(groups.keys()),
      (batch) =>
        tx.transaction.findMany({
          where: {
            householdId,
            accountId: account.id,
            OR: batch.map((hash) => ({
              importHash: { startsWith: `${hash}:` },
            })),
          },
          select: { importHash: true },
        })
    );

    let inserted = 0;
    let skippedDuplicates = 0;

    type InsertData = {
      date: Date;
      description: string;
      merchant: string | null;
      amountPence: number;
      source: string;
      importHash: string;
      categoryId: string | null;
      categorySource: string;
      accountId: string;
      householdId: string;
    };
    const toInsert: InsertData[] = [];

    for (const [hash, entries] of groups.entries()) {
      const existing = existingCounts.get(hash) ?? 0;
      for (let k = 0; k < entries.length; k++) {
        if (k < existing) {
          // Skip the first `existingCount` rows of each group.
          skippedDuplicates++;
          continue;
        }
        const { row } = entries[k];
        const dupSeq = k; // existingCount, existingCount+1, … since k >= existing
        const categoryId =
          row.categoryName && row.categoryName !== ""
            ? nameToId.get(row.categoryName) ?? null
            : null;
        const categorySource = row.categorySource ?? "none";
        toInsert.push({
          date: new Date(row.date + "T00:00:00.000Z"),
          description: row.description,
          merchant: row.merchant !== "" ? row.merchant : null,
          amountPence: row.amountPence,
          source,
          importHash: buildImportHash(hash, dupSeq),
          categoryId,
          categorySource,
          accountId: account.id,
          householdId,
        });
      }
    }

    if (toInsert.length > 0) {
      // Strictly insert-only.
      const result = await tx.transaction.createMany({ data: toInsert });
      inserted = result.count;
    }

    // Auto-save a CategoryRule for every merchant the user manually
    // categorised in the preview step, so the same merchant is
    // auto-categorised (source "rule") on future statement imports without
    // any extra action. Previously, picking a category in the import preview
    // only applied to that one batch — nothing persisted for next time.
    // Pattern derivation matches the existing "save rule" prompt on the
    // Transactions page: (merchant || description), uppercased — both are
    // already normalisation-derived, so the pattern is a safe substring of
    // what `categorize()` matches against on the next import.
    const patternToCategoryId = new Map<string, string>();
    for (const row of body.rows) {
      if (row.categorySource !== "manual") continue;
      if (!row.categoryName) continue;
      const categoryId = nameToId.get(row.categoryName);
      if (!categoryId) continue;
      const pattern = (row.merchant || row.description).toUpperCase().trim();
      if (pattern === "") continue;
      patternToCategoryId.set(pattern, categoryId);
    }

    let rulesSaved = 0;
    for (const [pattern, categoryId] of patternToCategoryId) {
      await tx.categoryRule.upsert({
        where: { householdId_pattern: { householdId, pattern } },
        create: { pattern, categoryId, householdId },
        update: { categoryId },
      });
      rulesSaved++;
    }

    const response: CommitResponse = { inserted, skippedDuplicates, rulesSaved };
    return NextResponse.json(response);
    });
  } catch (err) {
    console.error("POST /api/import/commit", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
