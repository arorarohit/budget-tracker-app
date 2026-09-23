/**
 * Low-level parsing primitives shared by every preset and the generic mapper.
 *
 * Money is integer pence; negative = money out. Dates are emitted as
 * "yyyy-MM-dd". Nothing here ever throws on bad input — callers get `null`
 * and turn that into a skipped-row warning.
 */

/**
 * Parse a raw amount string into integer pence.
 *
 * Handles: leading/trailing whitespace, "£" symbol, thousands commas,
 * parentheses-as-negative "(12.34)", trailing "DR" (debit → negative) and
 * "CR" (credit → positive) markers, and an explicit leading sign.
 *
 * Uses Math.round(parseFloat * 100) to avoid binary-float drift on values
 * like 0.29 or 19.99.
 *
 * @returns integer pence, or null when the string contains no parseable number.
 */
export function parseAmountToPence(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;

  let s = String(raw).trim();
  if (s === "") return null;

  let sign = 1;

  // Parentheses denote a negative value: "(12.34)" → -12.34
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1).trim();
  }

  // Trailing DR/CR markers (case-insensitive), optionally space-separated.
  const drCr = s.match(/(DR|CR)\.?$/i);
  if (drCr) {
    if (/^DR/i.test(drCr[1])) sign *= -1; // debit → out
    // CR is positive: no sign change
    s = s.slice(0, drCr.index).trim();
  }

  // Strip currency symbols, commas, and any internal whitespace.
  s = s.replace(/[£$€]/g, "").replace(/,/g, "").replace(/\s+/g, "");

  if (s === "" || s === "-" || s === "+") return null;

  // Must look like a number (optional sign, digits, optional decimal part).
  if (!/^[+-]?\d*\.?\d+$/.test(s)) return null;

  const value = parseFloat(s);
  if (Number.isNaN(value)) return null;

  return Math.round(value * sign * 100);
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** Validate a real calendar date and format as "yyyy-MM-dd"; null if invalid. */
function toIso(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  // Reject dates that roll over (e.g. 31 Feb, 31 Apr) by round-tripping
  // through a UTC Date and checking the components survived unchanged.
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** Expand a 2-digit year using the 2000s window (e.g. 26 → 2026, 99 → 1999). */
function expandYear(y: number): number {
  if (y >= 100) return y;
  return y <= 69 ? 2000 + y : 1900 + y;
}

/**
 * Parse "DD/MM/YYYY" (also tolerates "-" / "." separators and 2-digit years).
 * The dominant UK bank export date format.
 */
export function parseUkDate(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = expandYear(parseInt(m[3], 10));
  return toIso(year, month, day);
}

/**
 * Parse a textual-month date: "DD Mon YYYY" or "DD-Mon-YY"
 * (Nationwide), e.g. "29 Dec 2026" and "29-Dec-26".
 */
export function parseTextMonthDate(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})[\s\-]+([A-Za-z]{3,4})[\s\-]+(\d{2,4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = MONTHS[m[2].toLowerCase()];
  if (month === undefined) return null;
  const year = expandYear(parseInt(m[3], 10));
  return toIso(year, month, day);
}

/** Parse "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS" → "yyyy-MM-dd" (Revolut). */
export function parseIsoDate(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})(?:[T\s].*)?$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  return toIso(year, month, day);
}

/** Parse "MM/DD/YYYY" (US order) → "yyyy-MM-dd". */
export function parseMdyDate(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  const year = expandYear(parseInt(m[3], 10));
  return toIso(year, month, day);
}

/** date-format dispatcher for the generic column mapper. */
export function parseDateByFormat(
  raw: string | null | undefined,
  format: "dmy" | "ymd" | "mdy",
): string | null {
  switch (format) {
    case "dmy":
      return parseUkDate(raw);
    case "ymd":
      return parseIsoDate(raw);
    case "mdy":
      return parseMdyDate(raw);
    default:
      return null;
  }
}

/** Strip leading/trailing single-quote wrappers (NatWest description quirk). */
export function stripQuotes(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  return String(raw).trim().replace(/^'+/, "").replace(/'+$/, "").trim();
}

/** Collapse internal whitespace and trim. */
export function collapseWhitespace(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  return String(raw).replace(/\s+/g, " ").trim();
}

/**
 * Locate the header row among the first ~10 rows.
 *
 * `matches(headers, sampleRows)` is invoked for each candidate row with that
 * row lower-cased+trimmed as `headers` and up to 5 following rows as
 * `sampleRows`. Returns the index of the first matching row, or -1.
 */
export function findHeaderRow(
  rows: string[][],
  matches: (headers: string[], sampleRows: string[][]) => boolean,
  scanLimit = 10,
): number {
  const limit = Math.min(scanLimit, rows.length);
  for (let i = 0; i < limit; i++) {
    const headers = rows[i].map((c) => c.trim().toLowerCase());
    const sampleRows = rows.slice(i + 1, i + 6);
    if (matches(headers, sampleRows)) return i;
  }
  return -1;
}

/**
 * Build keyed records from a data region, using the supplied header names as
 * keys (original trimmed casing). Cells beyond the header length are ignored;
 * missing trailing cells become "".
 */
export function toRecords(
  headerNames: string[],
  dataRows: string[][],
): Record<string, string>[] {
  return dataRows.map((row) => {
    const rec: Record<string, string> = {};
    for (let i = 0; i < headerNames.length; i++) {
      rec[headerNames[i]] = (row[i] ?? "").trim();
    }
    return rec;
  });
}

/** Build synthetic "col0".."colN" records for headerless files. */
export function toColRecords(dataRows: string[][]): Record<string, string>[] {
  return dataRows.map((row) => {
    const rec: Record<string, string> = {};
    for (let i = 0; i < row.length; i++) {
      rec[`col${i}`] = (row[i] ?? "").trim();
    }
    return rec;
  });
}
