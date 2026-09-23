/**
 * Generic ColumnMapping-driven parser — the universal fallback for banks
 * without a dedicated preset (e.g. Santander's quirky export). The UI builds
 * a ColumnMapping from the file's headers and hands it here.
 *
 * Supports either a single signed `amountColumn` OR a `debitColumn`/
 * `creditColumn` pair (both positive, one blank per row). `invertAmount`
 * negates the resolved amount for credit-card exports where positive = spend.
 */

import type { ColumnMapping, ParsedTransaction } from "@/lib/types";
import { parseAmountToPence, parseDateByFormat, collapseWhitespace } from "./helpers";

/** Read a column from a record, exact key first then case-insensitive. */
function field(rec: Record<string, string>, name: string): string {
  if (name in rec) return rec[name];
  const lower = name.toLowerCase();
  for (const key of Object.keys(rec)) {
    if (key.toLowerCase() === lower) return rec[key];
  }
  return "";
}

/**
 * Parse records (keyed by header name) using an explicit column mapping.
 * Rows with an unparseable date or amount are omitted; the engine reports
 * the skipped count as a warning.
 */
export function parseWithMapping(
  records: Record<string, string>[],
  mapping: ColumnMapping,
): ParsedTransaction[] {
  const out: ParsedTransaction[] = [];

  for (const rec of records) {
    const date = parseDateByFormat(field(rec, mapping.dateColumn), mapping.dateFormat);
    if (date === null) continue;

    let amountPence: number | null = null;

    if (mapping.amountColumn) {
      amountPence = parseAmountToPence(field(rec, mapping.amountColumn));
    } else if (mapping.debitColumn || mapping.creditColumn) {
      const debit = mapping.debitColumn
        ? parseAmountToPence(field(rec, mapping.debitColumn))
        : null;
      const credit = mapping.creditColumn
        ? parseAmountToPence(field(rec, mapping.creditColumn))
        : null;
      if (debit !== null && debit !== 0) {
        amountPence = -Math.abs(debit);
      } else if (credit !== null && credit !== 0) {
        amountPence = Math.abs(credit);
      } else if (debit === 0 || credit === 0) {
        amountPence = 0;
      }
    }

    if (amountPence === null) continue;

    if (mapping.invertAmount) amountPence = -amountPence;

    const description = collapseWhitespace(field(rec, mapping.descriptionColumn));
    out.push({ date, description, amountPence });
  }

  return out;
}
