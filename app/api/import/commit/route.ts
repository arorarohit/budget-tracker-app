import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildImportHash, contentHash } from "@/lib/import-hash";
import type { CommitRequest, CommitResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  try {
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

    const account = await prisma.account.findUnique({
      where: { id: body.accountId },
    });
    if (!account) {
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
        ? await prisma.category.findMany({
            where: { name: { in: wantedNames } },
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

    // Existing count per hash.
    const existingCounts = new Map<string, number>();
    await Promise.all(
      Array.from(groups.keys()).map(async (h) => {
        const count = await prisma.transaction.count({
          where: { importHash: { startsWith: `${h}:` } },
        });
        existingCounts.set(h, count);
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
        });
      }
    }

    if (toInsert.length > 0) {
      // Strictly insert-only.
      await prisma.$transaction(
        toInsert.map((data) => prisma.transaction.create({ data }))
      );
      inserted = toInsert.length;
    }

    const response: CommitResponse = { inserted, skippedDuplicates };
    return NextResponse.json(response);
  } catch (err) {
    console.error("POST /api/import/commit", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
