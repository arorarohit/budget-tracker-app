"use client";

import React from "react";
import type { CategoryDTO, CategoryRef } from "@/lib/types";

/**
 * Compact category selector for a single transaction row. Renders a subtly
 * styled native <select> listing "Uncategorised" plus all categories grouped
 * by type (expense / income / transfer). Emits the chosen category id (or null
 * for uncategorised). Disabled while a mutation is in flight.
 */

const UNCATEGORIZED_VALUE = "none";

const TYPE_GROUPS: { type: string; label: string }[] = [
  { type: "expense", label: "Expense" },
  { type: "income", label: "Income" },
  { type: "transfer", label: "Transfer" },
];

export default function CategoryPicker({
  categories,
  current,
  disabled = false,
  onChange,
}: {
  categories: CategoryDTO[];
  /** The transaction's current category, or null when uncategorised */
  current: CategoryRef | null;
  disabled?: boolean;
  /** null = clear category (uncategorised) */
  onChange: (categoryId: string | null) => void;
}) {
  const value = current ? current.id : UNCATEGORIZED_VALUE;

  // Categories whose type isn't one of the known groups fall into "Other".
  const known = new Set(TYPE_GROUPS.map((g) => g.type));
  const other = categories.filter((c) => !known.has(c.type));

  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === UNCATEGORIZED_VALUE ? null : v);
      }}
      aria-label="Category"
      className="max-w-[10rem] truncate rounded-md border border-slate-700/60 bg-slate-900/40 px-2 py-1 text-xs text-slate-200 outline-none transition-colors hover:border-slate-600 focus:border-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
      style={current ? { color: current.color } : undefined}
    >
      <option value={UNCATEGORIZED_VALUE}>❓ Uncategorised</option>
      {TYPE_GROUPS.map((group) => {
        const inGroup = categories.filter((c) => c.type === group.type);
        if (inGroup.length === 0) return null;
        return (
          <optgroup key={group.type} label={group.label}>
            {inGroup.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </optgroup>
        );
      })}
      {other.length > 0 && (
        <optgroup label="Other">
          {other.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
