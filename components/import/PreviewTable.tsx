"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Select, Spinner } from "@/components/ui";
import { formatDate, formatPence } from "@/lib/format";
import type { CategoryDTO, CommitRequest, PreviewResponse } from "@/lib/types";

const UNCATEGORISED = "__uncat__";

/** Per-row category state tracked in the UI. */
interface RowState {
  categoryName: string | null;
  categorySource: "rule" | "builtin" | "manual" | null;
}

type CommitRow = CommitRequest["rows"][number];

export default function PreviewTable({
  preview,
  loading,
  error,
  onBack,
  onCommit,
}: {
  preview: PreviewResponse;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onCommit: (rows: CommitRow[]) => void;
}) {
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [catsLoaded, setCatsLoaded] = useState(false);
  const [excludedRows, setExcludedRows] = useState<Set<number>>(new Set());

  // Seed per-row state from the server response (keyed by row index).
  const [rowStates, setRowStates] = useState<RowState[]>(() =>
    preview.rows.map((r) => ({
      categoryName: r.categoryName,
      categorySource: r.categorySource,
    }))
  );

  // Re-seed if a fresh preview arrives.
  useEffect(() => {
    setExcludedRows(new Set());
    setRowStates(
      preview.rows.map((r) => ({
        categoryName: r.categoryName,
        categorySource: r.categorySource,
      }))
    );
  }, [preview]);

  function toggleExcluded(index: number) {
    setExcludedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  useEffect(() => {
    let active = true;
    fetch("/api/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: CategoryDTO[]) => {
        if (active) setCategories(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        /* non-fatal */
      })
      .finally(() => {
        if (active) setCatsLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  function onPickCategory(index: number, value: string) {
    const categoryName = value === UNCATEGORISED ? null : value;
    setRowStates((prev) => {
      const next = prev.slice();
      // Any user pick marks the row "manual" (null when cleared).
      next[index] = {
        categoryName,
        categorySource: categoryName === null ? null : "manual",
      };
      return next;
    });
  }

  const newCount = preview.newCount;

  const commitRows = useMemo<CommitRow[]>(() => {
    const out: CommitRow[] = [];
    preview.rows.forEach((row, i) => {
    if (row.duplicate || excludedRows.has(i)) return;
      const state = rowStates[i] ?? {
        categoryName: row.categoryName,
        categorySource: row.categorySource,
      };
      out.push({
        date: row.date,
        description: row.description,
        merchant: row.merchant,
        categoryName: state.categoryName,
        categorySource: state.categorySource,
        amountPence: row.amountPence,
      });
    });
    return out;
  }, [preview, rowStates, excludedRows]);

  const importCount = commitRows.length;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-200">
              Detected: {preview.presetName}
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              <span className="text-emerald-400">{newCount} new</span>
              {" · "}
              <span className="text-slate-500">
                {preview.duplicateCount} duplicate
                {preview.duplicateCount === 1 ? "" : "s"} skipped
              </span>
            </div>
          </div>
        </div>

        {preview.warnings.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
            <div className="mb-1 font-medium">Warnings</div>
            <ul className="list-inside list-disc space-y-0.5 text-amber-200/90">
              {preview.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Description</th>
              <th className="px-4 py-3 text-left font-medium">Category</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 text-right font-medium">Import</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, i) => {
              const state = rowStates[i];
              const selectValue = state?.categoryName ?? UNCATEGORISED;
              const out = row.amountPence < 0;
              const excluded = excludedRows.has(i);
              return (
                <tr
                  key={i}
                  className={`border-b border-slate-800/60 last:border-0 ${
                    row.duplicate || excluded ? "opacity-50" : ""
                  }`}
                >
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-400">
                    {formatDate(row.date)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-200">
                      {row.merchant}
                    </div>
                    {row.merchant !== row.description && (
                      <div className="text-xs text-slate-500">
                        {row.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {row.duplicate ? (
                      <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-0.5 text-xs font-medium text-slate-400">
                        Duplicate
                      </span>
                    ) : excluded ? (
                      <span className="text-xs font-medium text-slate-500">
                        Not importing
                      </span>
                    ) : !catsLoaded ? (
                      <Spinner />
                    ) : (
                      <Select
                        value={selectValue}
                        onChange={(e) => onPickCategory(i, e.target.value)}
                      >
                        <option value={UNCATEGORISED}>Uncategorised</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.icon} {c.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums ${
                      out ? "text-red-400" : "text-emerald-400"
                    }`}
                  >
                    {formatPence(row.amountPence)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    {!row.duplicate && (
                      <Button
                        variant="secondary"
                        onClick={() => toggleExcluded(i)}
                        aria-label={`${excluded ? "Include" : "Exclude"} ${row.description}`}
                      >
                        {excluded ? "Include" : "Exclude"}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={onBack} disabled={loading}>
          Back
        </Button>
        <Button
          variant="primary"
          onClick={() => onCommit(commitRows)}
          disabled={loading || importCount === 0}
        >
          {loading ? (
            <>
              <Spinner /> Importing…
            </>
          ) : (
            `Import ${importCount} transaction${importCount === 1 ? "" : "s"}`
          )}
        </Button>
      </div>
    </div>
  );
}
