"use client";

import React from "react";
import { CategoryBadge } from "@/components/ui";
import { formatPenceAbs } from "@/lib/format";
import type { CategoryDTO } from "@/lib/types";

/**
 * One editable row per expense category. The pounds input is a controlled
 * string so the field can be blank (= "no budget"). The parent owns the
 * draft state map (categoryId -> pounds string) and the spent-this-month
 * lookup; this component is purely presentational + emits changes.
 */

/** Parse a pounds input string to integer pence, or null when blank/invalid. */
export function poundsToPence(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const pounds = Number(trimmed);
  if (!Number.isFinite(pounds) || pounds < 0) return null;
  return Math.round(pounds * 100);
}

export default function BudgetEditor({
  category,
  spentPence,
  value,
  onChange,
}: {
  category: CategoryDTO;
  /** positive number = total spent this month */
  spentPence: number;
  /** controlled pounds string ("" = no budget) */
  value: string;
  onChange: (value: string) => void;
}) {
  const budgetPence = poundsToPence(value);
  const hasBudget = budgetPence !== null && budgetPence > 0;
  const over = hasBudget && spentPence > budgetPence;
  const overBy = hasBudget ? spentPence - budgetPence : 0;
  const pct = hasBudget
    ? Math.min(100, Math.round((spentPence / budgetPence) * 100))
    : 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_8rem_10rem] items-center gap-4 py-3">
      <div className="min-w-0">
        <CategoryBadge name={category.name} color={category.color} icon={category.icon} />
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              backgroundColor: over ? "#f87171" : category.color,
            }}
          />
        </div>
        {over && (
          <div className="mt-0.5 text-xs font-medium text-red-400">
            over by {formatPenceAbs(overBy)}
          </div>
        )}
      </div>

      <div className="text-right text-sm tabular-nums text-slate-400">
        {formatPenceAbs(spentPence)}
      </div>

      <div className="flex items-center justify-end gap-1.5">
        <span className="text-sm text-slate-500">£</span>
        <input
          type="number"
          step={1}
          min={0}
          inputMode="decimal"
          placeholder="—"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`Monthly budget for ${category.name}`}
          className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-right text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-emerald-600"
        />
      </div>
    </div>
  );
}
