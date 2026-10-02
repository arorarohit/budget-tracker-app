"use client";

import React, { useState } from "react";
import { Button, Spinner } from "@/components/ui";
import { formatDate, formatPence } from "@/lib/format";
import type { CategoryDTO, TxnDTO } from "@/lib/types";
import CategoryPicker from "./CategoryPicker";

/**
 * The transactions table. Each row shows date, merchant (+ raw description when
 * it differs), account, an inline CategoryPicker, the signed amount, a notes
 * indicator and a delete control.
 *
 * Category changes are delegated to the parent (onCategoryChange) so the parent
 * can drive the PATCH and decide whether to open the rule prompt — keeping the
 * rule-prompt state in the page where the refetch lives.
 *
 * Below the `sm` breakpoint (phones), this renders a stacked card list
 * instead of the table — a 6-column table forced into `overflow-x-auto` on a
 * narrow screen means sideways-scrolling to review a transaction, which is
 * painful for exactly the task this page exists for. At `sm` and above
 * (iPad portrait upward, and all laptop/desktop widths) the table renders
 * completely unchanged from before.
 */
export default function TransactionsTable({
  transactions,
  categories,
  /** id of the row whose category PATCH is currently in flight */
  busyId,
  onCategoryChange,
  onDelete,
}: {
  transactions: TxnDTO[];
  categories: CategoryDTO[];
  busyId: string | null;
  onCategoryChange: (txn: TxnDTO, categoryId: string | null) => void;
  onDelete: (txn: TxnDTO) => void;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(txn: TxnDTO) {
    if (!confirm("Delete this transaction? This cannot be undone.")) return;
    setDeletingId(txn.id);
    try {
      await onDelete(txn);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {/* Phone layout: one card per transaction, no horizontal scrolling. */}
      <ul className="space-y-2 sm:hidden">
        {transactions.map((txn) => {
          const display = txn.merchant ?? txn.description;
          const showRaw =
            txn.description.trim().length > 0 &&
            txn.description.trim() !== display.trim();
          const out = txn.amountPence < 0;
          const rowBusy = busyId === txn.id;
          const rowDeleting = deletingId === txn.id;

          return (
            <li
              key={txn.id}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-200">{display}</div>
                  {showRaw && (
                    <div className="truncate text-xs text-slate-500">
                      {txn.description}
                    </div>
                  )}
                  <div className="mt-0.5 text-xs text-slate-500">
                    {formatDate(txn.date)}
                    {txn.account ? ` · ${txn.account.name}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-start gap-1.5">
                  <div
                    className={`font-medium tabular-nums ${
                      out ? "text-red-400" : "text-emerald-400"
                    }`}
                  >
                    {formatPence(txn.amountPence)}
                  </div>
                  {txn.notes && (
                    <span
                      title={txn.notes}
                      className="text-slate-500"
                      aria-label="Has notes"
                    >
                      📝
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-800/60 pt-2.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <CategoryPicker
                    categories={categories}
                    current={txn.category}
                    disabled={rowBusy}
                    onChange={(categoryId) => onCategoryChange(txn, categoryId)}
                  />
                  {rowBusy && <Spinner />}
                </div>
                <Button
                  variant="ghost"
                  onClick={() => handleDelete(txn)}
                  disabled={rowDeleting}
                  aria-label="Delete transaction"
                  title="Delete"
                  className="min-h-[2.75rem] min-w-[2.75rem] shrink-0 justify-center text-base"
                >
                  {rowDeleting ? <Spinner /> : "✕"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* sm and above: unchanged original table. */}
      <div className="hidden overflow-x-auto sm:block">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wider text-slate-500">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Merchant</th>
            <th className="px-3 py-2 font-medium">Account</th>
            <th className="px-3 py-2 font-medium">Category</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {transactions.map((txn) => {
            const display = txn.merchant ?? txn.description;
            const showRaw =
              txn.description.trim().length > 0 &&
              txn.description.trim() !== display.trim();
            const out = txn.amountPence < 0;
            const rowBusy = busyId === txn.id;
            const rowDeleting = deletingId === txn.id;

            return (
              <tr
                key={txn.id}
                className="border-b border-slate-800/60 align-top hover:bg-slate-900/40"
              >
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-400">
                  {formatDate(txn.date)}
                </td>
                <td className="px-3 py-2.5">
                  <div className="font-medium text-slate-200">{display}</div>
                  {showRaw && (
                    <div className="text-xs text-slate-500">
                      {txn.description}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                  {txn.account ? txn.account.name : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <CategoryPicker
                      categories={categories}
                      current={txn.category}
                      disabled={rowBusy}
                      onChange={(categoryId) =>
                        onCategoryChange(txn, categoryId)
                      }
                    />
                    {rowBusy && <Spinner />}
                  </div>
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums ${
                    out ? "text-red-400" : "text-emerald-400"
                  }`}
                >
                  {formatPence(txn.amountPence)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {txn.notes && (
                      <span
                        title={txn.notes}
                        className="cursor-help text-slate-500"
                        aria-label="Has notes"
                      >
                        📝
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => handleDelete(txn)}
                      disabled={rowDeleting}
                      aria-label="Delete transaction"
                      title="Delete"
                    >
                      {rowDeleting ? <Spinner /> : "✕"}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}
