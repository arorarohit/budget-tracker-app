import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseCsv } from "@/lib/parsers";
import { parsePdfBuffer } from "@/lib/parsers/pdf";
import { categorize, displayMerchant } from "@/lib/categorize";
import { contentHash } from "@/lib/import-hash";
import type {
  PreviewRequest,
  PreviewResponse,
  PreviewRow,
  UserRule,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_ACCOUNT_TYPES = ["current", "savings", "credit_card"];

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const contentType = req.headers.get("content-type") || "";
    let csvText = "";
    let accountName = "";
    let accountType = "current";
    let presetId = "";
    let mapping = undefined;
    let isPdf = false;
    let pdfRows: Array<{ date: string; description: string; amountPence: number }> = [];
    let detectedPreset = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      accountName = (formData.get("accountName") as string) || "";
      accountType = (formData.get("accountType") as string) || "current";
      presetId = (formData.get("presetId") as string) || "";
      
      const file = formData.get("file") as File | null;
      if (file && (file.type === "application/pdf" || file.name.endsWith(".pdf"))) {
        isPdf = true;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const res = await parsePdfBuffer(buffer, presetId, {
          invertPositiveAmounts: accountType === "credit_card",
        });
        pdfRows = res.transactions;
        detectedPreset = res.bank;
      } else if (file) {
        csvText = await file.text();
      }
    } else {
      const body = (await req.json()) as PreviewRequest;
      csvText = typeof body.csvText === "string" ? body.csvText : "";
      accountName =
        typeof body.accountName === "string" ? body.accountName.trim() : "";
      accountType =
        typeof body.accountType === "string" &&
        VALID_ACCOUNT_TYPES.includes(body.accountType)
          ? body.accountType
          : "current";
      presetId = body.presetId || "";
      mapping = body.mapping;
    }

    if (!isPdf && csvText.trim() === "") {
      return NextResponse.json(
        { error: "A statement file or csvText is required" },
        { status: 400 }
      );
    }
    if (accountName.trim() === "") {
      return NextResponse.json(
        { error: "accountName is required" },
        { status: 400 }
      );
    }

    if (!VALID_ACCOUNT_TYPES.includes(accountType)) {
      accountType = "current";
    }

    // Upsert the account by name; only set the type when creating.
    const account = await prisma.account.upsert({
      where: { name: accountName.trim() },
      create: { name: accountName.trim(), type: accountType },
      update: {},
    });

    let rawRows: Array<{ date: string; description: string; amountPence: number }> = [];
    let warnings: string[] = [];
    let finalPresetId = presetId;
    let parsedPresetName = "";
    let headers: string[] = [];

    if (isPdf) {
      rawRows = pdfRows;
      finalPresetId = detectedPreset;
      parsedPresetName = detectedPreset;
      if (rawRows.length === 0) {
        warnings.push("No transactions could be parsed from the PDF. Please check the format.");
      }
    } else {
      // Parse the CSV (preset or generic mapping or auto-detect).
      const parsed = parseCsv(csvText, {
        presetId,
        mapping,
      });
      rawRows = parsed.rows;
      warnings = parsed.warnings;
      finalPresetId = parsed.presetId;
      parsedPresetName = parsed.presetName;
      headers = parsed.headers;
    }

    // Load user rules once (with category names) for categorisation.
    const dbRules = await prisma.categoryRule.findMany({
      include: { category: { select: { name: true } } },
    });
    const userRules: UserRule[] = dbRules.map((r) => ({
      pattern: r.pattern,
      categoryName: r.category.name,
    }));

    // Group incoming rows by content hash; index positions to preserve order.
    const groups = new Map<string, number[]>();
    const hashes: string[] = [];
    for (let i = 0; i < rawRows.length; i++) {
      const h = contentHash(account.id, rawRows[i]);
      hashes.push(h);
      const arr = groups.get(h);
      if (arr) arr.push(i);
      else groups.set(h, [i]);
    }

    // For each distinct hash, count how many rows already exist in the DB.
    const existingCounts = new Map<string, number>();
    await Promise.all(
      Array.from(groups.keys()).map(async (h) => {
        const count = await prisma.transaction.count({
          where: { importHash: { startsWith: `${h}:` } },
        });
        existingCounts.set(h, count);
      })
    );

    // The first `existingCount` rows of each group are flagged duplicate.
    const duplicateFlags = new Array<boolean>(rawRows.length).fill(false);
    for (const [h, indices] of groups.entries()) {
      const existing = existingCounts.get(h) ?? 0;
      for (let k = 0; k < indices.length && k < existing; k++) {
        duplicateFlags[indices[k]] = true;
      }
    }

    const rows: PreviewRow[] = rawRows.map((t, i) => {
      const result = categorize(t.description, userRules);
      return {
        date: t.date,
        description: t.description,
        amountPence: t.amountPence,
        merchant: displayMerchant(t.description),
        categoryName: result.categoryName,
        categorySource: result.source,
        duplicate: duplicateFlags[i],
      };
    });

    const duplicateCount = duplicateFlags.filter(Boolean).length;
    const newCount = rows.length - duplicateCount;

    const response: PreviewResponse = {
      accountId: account.id,
      presetId: finalPresetId,
      presetName: isPdf ? finalPresetId : parsedPresetName,
      headers: headers,
      rows,
      warnings,
      newCount,
      duplicateCount,
    };
    return NextResponse.json(response);
  } catch (err) {
    console.error("POST /api/import/preview", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
