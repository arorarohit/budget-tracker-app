"use client";

/**
 * "What should I look at first?" strip for the Dashboard. Every other widget
 * on this page answers "what happened this month" (totals, a pie, a 12-month
 * trend) — none of them tell the user whether anything needs action. This is
 * the one place that does, surfaced above everything else so it's read
 * first.
 *
 * Three signals, each only shown when it's actually true/relevant:
 *  1. Categories currently over their budget — always accurate regardless of
 *     import cadence, since it's just "spend so far vs. budget" on whatever
 *     has actually been imported.
 *  2. Uncategorised transaction count — same reasoning, always accurate.
 *  3. A budget-PACING line ("62% of budget used, 35% of month left") — but
 *     ONLY when the household's last transaction is recent (<= 5 days old).
 *     This app is statement-import driven, not live-feed: a user who hasn't
 *     imported in 3 weeks would otherwise see a misleadingly low spend
 *     figure that implies they're comfortably under budget, when really the
 *     data just hasn't caught up. When the last import is stale, we show an
 *     honest prompt to go import instead of a number that could be wrong.
 *
 * Renders nothing if there's truly nothing to flag (all budgets on track,
 * nothing uncategorised, data fresh) — an all-clear dashboard shouldn't
 * manufacture a reason to show this strip.
 */
import Link from "next/link";
import { Card } from "@/components/ui";
import { formatPenceAbs } from "@/lib/format";
import type { BudgetProgress, StatsResponse } from "@/lib/types";

const STALE_IMPORT_DAYS = 5;

function daysAgo(isoDate: string): number {
  const then = new Date(isoDate + "T00:00:00Z").getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
}

function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function dayOfMonthElapsed(month: string): number {
  const now = new Date();
  const [y, m] = month.split("-").map(Number);
  const isCurrentMonth = now.getFullYear() === y && now.getMonth() + 1 === m;
  return isCurrentMonth ? now.getDate() : daysInMonth(month);
}

export default function NeedsAttention({ stats }: { stats: StatsResponse }) {
  const overBudget: BudgetProgress[] = stats.budgets.filter(
    (b) => b.spentPence > b.budgetPence
  );

  const totalBudgeted = stats.budgets.reduce((s, b) => s + b.budgetPence, 0);
  const totalSpentAgainstBudgets = stats.budgets.reduce((s, b) => s + b.spentPence, 0);

  const importIsFresh =
    stats.lastTransactionDate !== null &&
    daysAgo(stats.lastTransactionDate) <= STALE_IMPORT_DAYS;
  const staleDays = stats.lastTransactionDate ? daysAgo(stats.lastTransactionDate) : null;

  const elapsedDays = dayOfMonthElapsed(stats.month);
  const totalDays = daysInMonth(stats.month);
  const monthPctElapsed = Math.round((elapsedDays / totalDays) * 100);
  const budgetPctUsed =
    totalBudgeted > 0 ? Math.round((totalSpentAgainstBudgets / totalBudgeted) * 100) : null;

  const hasOverBudget = overBudget.length > 0;
  const hasUncategorized = stats.uncategorizedCount > 0;
  // Only worth a pacing line if there's a budget to pace against, and either
  // showing fresh pacing or a stale-import nudge is meaningful.
  const showPacing = totalBudgeted > 0;
  const showStalePrompt = showPacing && !importIsFresh;

  const nothingToFlag = !hasOverBudget && !hasUncategorized && !showPacing;
  if (nothingToFlag) return null;

  return (
    <Card className="border-slate-700">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        {hasOverBudget && (
          <div className="min-w-[14rem] flex-1">
            <div className="text-xs font-semibold text-amber-400">
              {overBudget.length} {overBudget.length === 1 ? "category" : "categories"} over budget
            </div>
            <ul className="mt-1.5 space-y-1">
              {overBudget.slice(0, 3).map((b) => (
                <li key={b.categoryId} className="flex items-center gap-1.5 text-sm text-slate-300">
                  <span>{b.icon}</span>
                  <span className="truncate">{b.name}</span>
                  <span className="shrink-0 tabular-nums text-red-400">
                    +{formatPenceAbs(b.spentPence - b.budgetPence)}
                  </span>
                </li>
              ))}
            </ul>
            {overBudget.length > 3 && (
              <div className="mt-1 text-xs text-slate-500">
                +{overBudget.length - 3} more
              </div>
            )}
          </div>
        )}

        {hasUncategorized && (
          <Link
            href="/transactions?uncategorized=true"
            className="group min-w-[12rem] flex-1"
          >
            <div className="text-xs font-semibold text-amber-400">Uncategorised</div>
            <div className="mt-1.5 text-sm text-slate-300">
              <span className="font-medium tabular-nums text-amber-300">
                {stats.uncategorizedCount}
              </span>{" "}
              transaction{stats.uncategorizedCount === 1 ? "" : "s"} need a category
            </div>
            <div className="mt-1 text-xs font-medium text-amber-400/70 group-hover:text-amber-300">
              Review &amp; categorise →
            </div>
          </Link>
        )}

        {showPacing && (
          <div className="min-w-[14rem] flex-1">
            {showStalePrompt ? (
              <>
                <div className="text-xs font-semibold text-slate-400">Budget pace</div>
                <div className="mt-1.5 text-sm text-slate-300">
                  Last import was{" "}
                  <span className="font-medium text-slate-200">
                    {staleDays} day{staleDays === 1 ? "" : "s"} ago
                  </span>
                  — bring in your latest statement to see where this month stands.
                </div>
                <Link
                  href="/import"
                  className="mt-1 inline-block text-xs font-medium text-emerald-400 hover:text-emerald-300"
                >
                  Import a statement →
                </Link>
              </>
            ) : (
              <>
                <div className="text-xs font-semibold text-slate-400">Budget pace</div>
                <div className="mt-1.5 text-sm text-slate-300">
                  <span className="font-medium tabular-nums text-slate-100">
                    {budgetPctUsed}%
                  </span>{" "}
                  of budget used ·{" "}
                  <span className="tabular-nums">{100 - monthPctElapsed}%</span> of the month left
                </div>
                <div className="mt-2 h-1.5 w-full max-w-[16rem] overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full ${
                      (budgetPctUsed ?? 0) > monthPctElapsed ? "bg-amber-400" : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(100, budgetPctUsed ?? 0)}%` }}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
