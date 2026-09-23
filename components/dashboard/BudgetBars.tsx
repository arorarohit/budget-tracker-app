"use client";

import Link from "next/link";
import { Button, Card, CardTitle, EmptyState } from "@/components/ui";
import { formatPenceAbs } from "@/lib/format";
import type { BudgetProgress } from "@/lib/types";

function BudgetRow({ b }: { b: BudgetProgress }) {
  const over = b.spentPence > b.budgetPence;
  const pct =
    b.budgetPence > 0
      ? Math.min(100, Math.round((b.spentPence / b.budgetPence) * 100))
      : b.spentPence > 0
        ? 100
        : 0;
  const overBy = b.spentPence - b.budgetPence;

  return (
    <li>
      <div className="mb-1 flex items-center gap-2 text-sm">
        <span className="shrink-0">{b.icon}</span>
        <span className="min-w-0 flex-1 truncate text-slate-300">{b.name}</span>
        <span className="shrink-0 tabular-nums text-slate-400">
          {formatPenceAbs(b.spentPence)}{" "}
          <span className="text-slate-600">/ {formatPenceAbs(b.budgetPence)}</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: over ? "#f87171" : b.color,
          }}
        />
      </div>
      {over && (
        <div className="mt-0.5 text-xs font-medium text-red-400">
          over by {formatPenceAbs(overBy)}
        </div>
      )}
    </li>
  );
}

export default function BudgetBars({ budgets }: { budgets: BudgetProgress[] }) {
  const totalBudgeted = budgets.reduce((s, b) => s + b.budgetPence, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spentPence, 0);
  const totalOver = totalSpent > totalBudgeted;

  return (
    <Card>
      <CardTitle>Budgets</CardTitle>
      {budgets.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="No budgets set"
          hint="Set monthly budgets to track your spending against targets."
          action={
            <Link href="/budgets">
              <Button variant="primary">Set budgets</Button>
            </Link>
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {budgets.map((b) => (
              <BudgetRow key={b.categoryId} b={b} />
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 text-sm">
            <span className="font-medium text-slate-400">Total</span>
            <span className="tabular-nums">
              <span className={totalOver ? "text-red-400" : "text-slate-200"}>
                {formatPenceAbs(totalSpent)}
              </span>
              <span className="text-slate-600"> / {formatPenceAbs(totalBudgeted)}</span>
            </span>
          </div>
        </>
      )}
    </Card>
  );
}
