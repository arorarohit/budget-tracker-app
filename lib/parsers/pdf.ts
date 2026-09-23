import pdf from "pdf-parse-fork";
import {
  parseAmountToPence,
  parseIsoDate,
  parseTextMonthDate,
  parseUkDate,
} from "./helpers";
import type { ParsedTransaction } from "@/lib/types";

const MONTH_MAP: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may_: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

interface TextItem {
  str: string;
  x: number;
  y: number;
}

/**
 * Custom pagerender that spatially sorts text items into visual lines
 * and preserves proximity between descriptions, amounts, and credit markers (CR).
 */
async function extractSpatialLinesAndItems(pageData: any): Promise<{ lines: string[]; items: TextItem[] }> {
  const textContent = await pageData.getTextContent();
  const items: TextItem[] = textContent.items
    .map((item: any) => ({
      str: item.str,
      x: Math.round(item.transform[4]),
      y: Math.round(item.transform[5]),
    }))
    .filter((item: TextItem) => item.str.trim().length > 0);

  // Group items by vertical position (Y coordinate with 4px tolerance)
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: string[] = [];
  let curLine: TextItem[] = [];
  let curY: number | null = null;

  for (const item of sorted) {
    if (curY === null || Math.abs(curY - item.y) > 4) {
      if (curLine.length > 0) {
        curLine.sort((a, b) => a.x - b.x);
        lines.push(curLine.map((i) => i.str).join(" "));
      }
      curLine = [item];
      curY = item.y;
    } else {
      curLine.push(item);
    }
  }

  if (curLine.length > 0) {
    curLine.sort((a, b) => a.x - b.x);
    lines.push(curLine.map((i) => i.str).join(" "));
  }

  return { lines, items };
}

/**
 * Parses Chase UK statement text lines.
 */
export function parseChasePdfText(lines: string[]): ParsedTransaction[] {
  const txs: ParsedTransaction[] = [];
  const lineRegex = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\s+(.+?)\s+([+-]?£?[\d,]+\.\d{2})(?:\s+([+-]?£?[\d,]+\.\d{2}))?$/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      /opening balance|closing balance|statement period|credit limit|available credit|statement balance|minimum payment|amount you need to pay/i.test(
        trimmed,
      )
    ) {
      continue;
    }

    const match = trimmed.match(lineRegex);
    if (match) {
      const [, day, monthStr, year, desc, amountRaw] = match;
      const mKey = monthStr.toLowerCase().slice(0, 3);
      const month = MONTH_MAP[mKey];
      if (!month) continue;

      const date = `${year}-${month}-${day.padStart(2, "0")}`;
      const amountPence = parseAmountToPence(amountRaw);
      if (amountPence === null) continue;

      const cleanDesc = desc.replace(/\s+(Purchase|Transfer)$/i, "").trim();
      if (/^(?:closing|opening) balance$/i.test(cleanDesc)) continue;
      const isRepayment = /repayment|payment received|refund|cashback|credit/i.test(cleanDesc);
      txs.push({
        date,
        description: cleanDesc || desc.trim(),
        amountPence: isRepayment ? Math.abs(amountPence) : amountPence,
      });
    }
  }

  return txs;
}

/**
 * Parses American Express PDF pages with spatial CR detection.
 */
export function parseAmexPdfLines(
  lines: string[],
  items: TextItem[],
  fallbackYear?: number
): ParsedTransaction[] {
  const txs: ParsedTransaction[] = [];

  // Determine statement year
  let year = fallbackYear || new Date().getFullYear();
  for (const line of lines) {
    const yearMatch = line.match(/20\d{2}/);
    if (yearMatch) {
      year = parseInt(yearMatch[0], 10);
      break;
    }
  }

  // Find all CR markers on this page (Amex puts CR on the line below amount)
  const crPositions = items.filter((i) => i.str.trim() === "CR");

  // Regex for Amex transaction row:
  // e.g. "Aug 3 Aug 3 ITSU LONDON 8.05" or "Aug 22 Aug 22 PAYMENT RECEIVED - THANK YOU 529.26"
  const amexRegex = /^([A-Za-z]{3,9})\s+(\d{1,2})\s+[A-Za-z]{3,9}\s+\d{1,2}\s+(.+?)\s+([\d,]+\.\d{2})$/i;

  for (const line of lines) {
    const match = line.trim().match(amexRegex);
    if (match) {
      const [, monthStr, dayStr, desc, amountRaw] = match;
      const mKey = monthStr.toLowerCase().slice(0, 3);
      const month = MONTH_MAP[mKey];
      if (!month) continue;

      const date = `${year}-${month}-${dayStr.padStart(2, "0")}`;
      const parsedPence = parseAmountToPence(amountRaw);
      if (parsedPence === null) continue;

      // Check if this line or description indicates credit / refund
      const isPaymentOrRebate = /PAYMENT RECEIVED|Cashback Rebate|DIRECT DEBIT PAYMENT/i.test(desc);
      
      // Look for a CR item directly below or near this amount
      const amountItem = items.find((i) => i.str.trim() === amountRaw);
      const hasCRBelow = amountItem
        ? crPositions.some((cr) => Math.abs(cr.x - amountItem.x) < 40 && amountItem.y - cr.y > 0 && amountItem.y - cr.y < 20)
        : false;

      const isCredit = isPaymentOrRebate || hasCRBelow;

      // Amex: spend is positive on statement -> convert to negative (spend)
      // Credits / refunds / payments -> positive
      const amountPence = isCredit ? Math.abs(parsedPence) : -Math.abs(parsedPence);

      txs.push({
        date,
        description: desc.trim(),
        amountPence,
      });
    }
  }

  return txs;
}

function parsePdfDate(raw: string, fallbackYear: number): string | null {
  const value = raw.trim();
  return (
    parseUkDate(value) ??
    parseIsoDate(value) ??
    parseTextMonthDate(value) ??
    (() => {
      const match = value.match(/^(\d{1,2})\s+([A-Za-z]{3,9})$/);
      if (!match) return null;
      return parseTextMonthDate(`${match[1]} ${match[2]} ${fallbackYear}`);
    })()
  );
}

function statementYear(lines: string[], fallbackYear = new Date().getFullYear()): number {
  for (const line of lines) {
    const match = line.match(/\b(20\d{2})\b/);
    if (match) return Number(match[1]);
  }
  return fallbackYear;
}

function normalizeOcrLine(line: string): string {
  return line
    .replace(/\b(\d{1,2})([A-Za-z]{3,9})\s+(20\d{2})\b/g, "$1 $2 $3")
    .replace(/(\d)\.(\d{3})\.(\d{2})\b/g, "$1,$2.$3")
    .replace(/\b(\d{1,2})[Aa][Uu][Gg](\d{4})\b/g, "$1 Aug $2")
    .replace(/\b(\d{1,2})[Ss][Ee][Pp][Tt]?(\d{4})\b/g, "$1 Sep $2")
    .replace(/\b(\d{1,2})([Jj][Aa][Nn]|[Ff][Ee][Bb]|[Mm][Aa][Rr]|[Aa][Pp][Rr]|[Mm][Aa][Yy]|[Jj][Uu][Nn]|[Jj][Uu][Ll]|[Oo][Cc][Tt]|[Nn][Oo][Vv]|[Dd][Ee][Cc])(\d{4})\b/g, "$1 $2 $3");
}

function parsePdfAmount(raw: string): number | null {
  if (!raw.includes(".") && /£/.test(raw)) {
    const sign = /^\s*-/.test(raw) ? -1 : 1;
    const digits = raw.replace(/[^\d]/g, "");
    return digits ? sign * Number(digits) : null;
  }
  return parseAmountToPence(raw);
}

async function extractOcrLines(buffer: Buffer): Promise<string[]> {
    // Keep the native canvas addon out of Next's webpack module graph. It is
    // needed only by the server-side OCR fallback and cannot be browser-bundled.
    const runtimeRequire = eval("require") as NodeRequire;
    const { createCanvas, Image } = runtimeRequire("@napi-rs/canvas") as typeof import("@napi-rs/canvas");
    const [pdfjs, { createWorker }] = await Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("tesseract.js"),
    ]);

    (globalThis as unknown as { Image?: typeof Image }).Image = Image;
    const document = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
    }).promise;
    const worker = await createWorker("eng");
    const lines: string[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 3 });
        const canvas = createCanvas(viewport.width, viewport.height);
        await page.render({
          canvasContext: canvas.getContext("2d") as any,
          viewport,
          canvasFactory: {
            create: () => ({ canvas, context: canvas.getContext("2d") }),
            reset: () => undefined,
            destroy: () => undefined,
          },
        } as any).promise;
        const result = await worker.recognize(canvas.toBuffer("image/png"));
        lines.push(
          ...result.data.text.split(/\r?\n/).map(normalizeOcrLine),
        );
      }
    } finally {
      await worker.terminate();
    }

    return lines;
}

/**
 * Fallback for UK PDFs whose text layer does not preserve table columns.
 * It accepts both a date/description/amount row and a date/description row
 * followed by an amount-only row, which covers common Chase, Barclays and
 * Amex card statement layouts.
 */
export function parseGenericPdfLines(
  lines: string[],
  options: { invertPositiveAmounts?: boolean; fallbackYear?: number } = {},
): ParsedTransaction[] {
  const year = statementYear(lines, options.fallbackYear);
  const transactions: ParsedTransaction[] = [];
  let pending: { date: string; description: string } | null = null;

  const datePattern =
    /\b(?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}(?:\s+\d{2,4})?)\b/i;
  const amountPattern =
    /(?:[+-]?(?:£\s*)?\(?\d[\d,]*\.\d{2}\)?|[+-]?£\s*\(?\d[\d,]*\)?)(?:\s*(?:CR|DR))?/gi;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (/^(?:opening|closing|brought forward|carried forward|available credit|credit limit|minimum payment|payment due|statement date|statement period|statement balance|amount you need to pay|account number|sort code|page \d)/i.test(line)) {
      continue;
    }

    const amountMatches = [...line.matchAll(amountPattern)];
    const amountMatch = amountMatches.at(-1);
    const dateMatch = line.match(datePattern);

    if (
      !dateMatch &&
      amountMatches.length === 0 &&
      /^repayment\b/i.test(line) &&
      transactions.length > 0 &&
      /^(?:from\b|payment received\b|repayment\b|refund\b|cashback\b|credit\b)/i.test(
        transactions[transactions.length - 1].description,
      )
    ) {
      const previous = transactions[transactions.length - 1];
      previous.description = `${previous.description} Repayment`;
      previous.amountPence = Math.abs(previous.amountPence);
      continue;
    }

    if (!dateMatch && amountMatches.length === 0 && pending) {
      pending.description = `${pending.description} ${line}`.replace(/\s+/g, " ").trim();
      continue;
    }

    if (!dateMatch && amountMatches.length === 1 && pending) {
      const amountPence = parsePdfAmount(amountMatch?.[0] ?? "");
      if (amountPence !== null && !/^(?:closing|opening) balance\b/i.test(pending.description)) {
        const isCredit = /payment|repayment|refund|cashback|credit|rebate/i.test(pending.description);
        transactions.push({
          date: pending.date,
          description: pending.description,
          amountPence: isCredit
            ? Math.abs(amountPence)
            : options.invertPositiveAmounts && amountPence > 0
              ? -amountPence
              : amountPence,
        });
      }
      pending = null;
      continue;
    }

    if (!dateMatch) continue;
    const date = parsePdfDate(dateMatch[0], year);
    if (!amountMatch) {
      const description = line
        .slice(dateMatch.index! + dateMatch[0].length)
        .replace(/^[|:–—-]+/, "")
        .trim();
      if (date && description) pending = { date, description };
      continue;
    }
    const amountPence = parsePdfAmount(amountMatch[0]);
    if (!date || amountPence === null) continue;

    const description = line
      .slice(dateMatch.index! + dateMatch[0].length, amountMatch.index)
      .replace(/^[|:–—-]+|[|:–—-]+$/g, "")
      .trim();
    if (
      !description ||
      /^(date|description|amount|balance|total)$/i.test(description) ||
      /^(?:available|credit limit|statement balance|amount you need to pay|minimum payment|payment due|opening balance|closing balance)\b/i.test(description)
    ) {
      continue;
    }
    const isCredit = /payment|repayment|refund|cashback|credit|rebate/i.test(description);

    transactions.push({
      date,
      description,
      amountPence: isCredit
        ? Math.abs(amountPence)
        : options.invertPositiveAmounts && amountPence > 0
          ? -amountPence
          : amountPence,
    });
  }

  return transactions;
}

/**
 * Entry point to extract transactions from a PDF buffer.
 */
export async function parsePdfBuffer(
  buffer: Buffer,
  presetHint?: string,
  options: { invertPositiveAmounts?: boolean } = {},
): Promise<{ transactions: ParsedTransaction[]; bank: string }> {
  const allLines: string[] = [];
  const allItems: TextItem[] = [];
  let usedOcr = false;

  await pdf(buffer, {
    pagerender: async (pageData: any) => {
      const { lines, items } = await extractSpatialLinesAndItems(pageData);
      allLines.push(...lines);
      allItems.push(...items);
      return lines.join("\n");
    },
  });

  let fullText = allLines.join("\n");
  if (fullText.trim() === "") {
    usedOcr = true;
    allLines.push(...(await extractOcrLines(buffer)));
    fullText = allLines.join("\n");
  }

  // Specific bank detection
  const isAmex =
    presetHint === "amex" ||
    /american express|americanexpress\.co\.uk/i.test(fullText) ||
    allLines.some((l) => /PAYMENT RECEIVED|Cashback Rebate/i.test(l));

  const isChase =
    presetHint === "chase" ||
    /chase\.co\.uk|\bchase bank\b/i.test(fullText) ||
    allLines.some((l) => /Round up Transfer|Round up Purchase/i.test(l));

  if (!usedOcr && isAmex) {
    const txs = parseAmexPdfLines(allLines, allItems);
    if (txs.length > 0) {
      return { transactions: txs, bank: "American Express" };
    }
  }

  if (!usedOcr && isChase) {
    const txs = parseChasePdfText(allLines);
    if (txs.length > 0) {
      return { transactions: txs, bank: "Chase UK" };
    }
  }

  // Fallback checks: try Amex then Chase
  if (!usedOcr) {
    const amexTxs = parseAmexPdfLines(allLines, allItems);
    if (amexTxs.length > 0) {
      return { transactions: amexTxs, bank: "American Express" };
    }

    const chaseTxs = parseChasePdfText(allLines);
    if (chaseTxs.length > 0) {
      return { transactions: chaseTxs, bank: "Chase UK" };
    }
  }

  const isCardStatement =
    /credit\s*card|cardmember|american\s*express|barclays\s*bank\s*plc/i.test(fullText) ||
    presetHint === "amex" ||
    presetHint === "barclays";
  const genericTxs = parseGenericPdfLines(allLines, {
    // Card statements commonly print purchases as positive values, unlike
    // current-account statements. Explicit CR/DR signs remain authoritative.
    invertPositiveAmounts: options.invertPositiveAmounts ?? isCardStatement,
  });
  if (genericTxs.length > 0) {
    const bank = /barclays/i.test(fullText) || presetHint === "barclays"
      ? "Barclays"
      : isAmex
        ? "American Express"
        : isChase
          ? "Chase UK"
          : "Unknown";
    return { transactions: genericTxs, bank };
  }

  return { transactions: [], bank: "Unknown" };
}
