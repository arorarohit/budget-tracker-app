/**
 * `@/lib/parsers` — public entry point.
 *
 * Exports:
 *   PRESETS            — all bank presets, for UI listing
 *   parseCsv           — the detection + parsing engine
 *   parseAmountToPence — re-exported low-level helper
 *
 * Engine flow (see lib/types.ts for the authoritative contract):
 *   1. PapaParse with header:false, skipEmptyLines:"greedy"; every cell trimmed.
 *   2. opts.mapping  → generic mapper (presetId "generic").
 *      opts.presetId → use that preset, still locating its header row
 *                      (so Nationwide preamble is skipped).
 *      otherwise     → auto-detect across PRESETS, including the headerless
 *                      structural path for HSBC.
 *   3. Bad rows (unparseable date/amount) are skipped, counted, and reported in
 *      warnings; nothing throws.
 */

import Papa from "papaparse";
import type {
  BankPreset,
  ColumnMapping,
  ParsedTransaction,
  ParseResult,
} from "@/lib/types";
import { PRESETS } from "./presets";
import { parseWithMapping } from "./generic";
import {
  parseAmountToPence,
  findHeaderRow,
  toRecords,
  toColRecords,
} from "./helpers";

export { PRESETS } from "./presets";
export { parseAmountToPence } from "./helpers";

const UNKNOWN_PRESET_NAME = "Unknown";
const GENERIC_PRESET_NAME = "Generic (mapped)";

/** Parse raw CSV text into a grid of trimmed string cells. */
function parseGrid(csvText: string): string[][] {
  const result = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: "greedy",
  });
  const rows = (result.data ?? []).map((row) =>
    (Array.isArray(row) ? row : [String(row)]).map((cell) =>
      cell === null || cell === undefined ? "" : String(cell).trim(),
    ),
  );
  // Drop fully-empty rows that "greedy" may still leave behind.
  return rows.filter((row) => row.some((cell) => cell !== ""));
}

/** Lower-case + trim a header row for detection. */
function lowerHeaders(row: string[]): string[] {
  return row.map((c) => c.trim().toLowerCase());
}

/**
 * Find which preset detects against a candidate header row + following rows.
 * Presets are tried in PRESETS order, so Amex (last) only wins when nothing
 * more specific matched.
 */
function detectPreset(headers: string[], sampleRows: string[][]): BankPreset | null {
  for (const preset of PRESETS) {
    if (preset.detect(headers, sampleRows)) return preset;
  }
  return null;
}

/** Append the skipped-row warning when parse() dropped any input rows. */
function noteSkipped(
  warnings: string[],
  inputCount: number,
  rows: ParsedTransaction[],
): void {
  const skipped = inputCount - rows.length;
  if (skipped > 0) {
    warnings.push(
      `Skipped ${skipped} row${skipped === 1 ? "" : "s"} with an unparseable date or amount.`,
    );
  }
}

export function parseCsv(
  csvText: string,
  opts?: { presetId?: string; mapping?: ColumnMapping },
): ParseResult {
  const warnings: string[] = [];
  const grid = parseGrid(csvText);

  if (grid.length === 0) {
    return {
      presetId: "unknown",
      presetName: UNKNOWN_PRESET_NAME,
      headers: [],
      rows: [],
      warnings: ["The file appears to be empty."],
    };
  }

  // --------------------------------------------------------------- mapping
  if (opts?.mapping) {
    const mapping = opts.mapping;
    const needles = [
      mapping.dateColumn,
      mapping.descriptionColumn,
      mapping.amountColumn,
      mapping.debitColumn,
      mapping.creditColumn,
    ].filter((c): c is string => Boolean(c));

    const headerIdx = findHeaderRow(grid, (headers) =>
      needles.every((n) => headers.includes(n.toLowerCase())),
    );
    const idx = headerIdx >= 0 ? headerIdx : 0;
    const headerNames = grid[idx];
    const records = toRecords(headerNames, grid.slice(idx + 1));
    const rows = parseWithMapping(records, mapping);
    if (headerIdx < 0) {
      warnings.push("Could not locate the mapped header row; assumed the first row.");
    }
    noteSkipped(warnings, records.length, rows);
    return {
      presetId: "generic",
      presetName: GENERIC_PRESET_NAME,
      headers: headerNames,
      rows,
      warnings,
    };
  }

  // -------------------------------------------------- explicit preset id
  if (opts?.presetId) {
    const preset = PRESETS.find((p) => p.id === opts.presetId);
    if (!preset) {
      warnings.push(`Unknown preset "${opts.presetId}".`);
      return {
        presetId: "unknown",
        presetName: UNKNOWN_PRESET_NAME,
        headers: grid[0],
        rows: [],
        warnings,
      };
    }

    // Locate this preset's own header row (skips Nationwide preamble).
    const headerIdx = findHeaderRow(grid, (headers, sampleRows) =>
      preset.detect(headers, sampleRows),
    );

    if (headerIdx >= 0 && grid[headerIdx].length > 0 && lowerHeaders(grid[headerIdx]).some((c) => c !== "")) {
      // Confirm this is a real header row (non-empty named columns), not the
      // structural headerless match where headers=[] never matched anyway.
      const headerRow = lowerHeaders(grid[headerIdx]);
      if (preset.detect(headerRow, grid.slice(headerIdx + 1, headerIdx + 6))) {
        const headerNames = grid[headerIdx];
        const records = toRecords(headerNames, grid.slice(headerIdx + 1));
        const rows = preset.parse(records);
        noteSkipped(warnings, records.length, rows);
        return {
          presetId: preset.id,
          presetName: preset.name,
          headers: headerNames,
          rows,
          warnings,
        };
      }
    }

    // Headerless path: synthetic col records from the whole grid.
    if (preset.detect([], grid.slice(0, 5))) {
      const records = toColRecords(grid);
      const rows = preset.parse(records);
      const headers = records[0] ? Object.keys(records[0]) : [];
      noteSkipped(warnings, records.length, rows);
      return {
        presetId: preset.id,
        presetName: preset.name,
        headers,
        rows,
        warnings,
      };
    }

    // Preset specified but header row not found: assume first row is header.
    const headerNames = grid[0];
    const records = toRecords(headerNames, grid.slice(1));
    const rows = preset.parse(records);
    warnings.push(`Could not locate the ${preset.name} header row; assumed the first row.`);
    noteSkipped(warnings, records.length, rows);
    return {
      presetId: preset.id,
      presetName: preset.name,
      headers: headerNames,
      rows,
      warnings,
    };
  }

  // --------------------------------------------------------- auto-detect
  const headerIdx = findHeaderRow(grid, (headers, sampleRows) => {
    if (headers.every((c) => c === "")) return false;
    return detectPreset(headers, sampleRows) !== null;
  });

  if (headerIdx >= 0) {
    const headerRow = lowerHeaders(grid[headerIdx]);
    const sampleRows = grid.slice(headerIdx + 1, headerIdx + 6);
    const preset = detectPreset(headerRow, sampleRows);
    if (preset) {
      const headerNames = grid[headerIdx];
      const records = toRecords(headerNames, grid.slice(headerIdx + 1));
      const rows = preset.parse(records);
      noteSkipped(warnings, records.length, rows);
      return {
        presetId: preset.id,
        presetName: preset.name,
        headers: headerNames,
        rows,
        warnings,
      };
    }
  }

  // Headerless structural detection (HSBC): headers=[] + first 5 raw rows.
  const headerlessPreset = detectPreset([], grid.slice(0, 5));
  if (headerlessPreset) {
    const records = toColRecords(grid);
    const rows = headerlessPreset.parse(records);
    const headers = records[0] ? Object.keys(records[0]) : [];
    noteSkipped(warnings, records.length, rows);
    return {
      presetId: headerlessPreset.id,
      presetName: headerlessPreset.name,
      headers,
      rows,
      warnings,
    };
  }

  // Nothing detected → unknown; surface best-guess headers for the UI mapper.
  warnings.push(
    "Could not detect the bank format. Use the column mapper to import this file.",
  );
  return {
    presetId: "unknown",
    presetName: UNKNOWN_PRESET_NAME,
    headers: grid[0],
    rows: [],
    warnings,
  };
}
