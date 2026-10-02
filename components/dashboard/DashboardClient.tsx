"use client";

/**
 * Client island for the Dashboard. All interactivity (month picker, retry,
 * charts) lives here. The page shell (app/page.tsx) is a Server Component
 * that prefetches the current month's stats and passes them in as
 * `initialStats`, which becomes SWR's `fallbackData` — so first paint on a
 * fresh navigation/reload shows real data immediately with zero client-side
 * fetch-and-spinner, while SWR still revalidates in the background and
 * shares its cache with the Budgets page for subsequent navigations.
 */
import Link from "next/link";
import { useState } from "react";
import MonthPicker from "@/components/MonthPicker";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
} from "@/components/ui";
import type { StatsResponse } from "@/lib/types";
import { useStats } from "@/lib/hooks/useStats";
import NeedsAttention from "@/components/dashboard/NeedsAttention";
import StatCards from "@/components/dashboard/StatCards";
import SpendDonut from "@/components/dashboard/SpendDonut";
import TrendChart from "@/components/dashboard/TrendChart";
import BudgetBars from "@/components/dashboard/BudgetBars";

function hasNoActivity(stats: StatsResponse): boolean {
  return (
    stats.totalSpendPence === 0 &&
    stats.totalIncomePence === 0 &&
    stats.uncategorizedCount === 0 &&
    stats.budgets.length === 0 &&
    stats.trend.every((t) => t.spendPence === 0 && t.incomePence === 0)
  );
}

export default function DashboardClient({
  initialMonth,
  initialStats,
}: {
  initialMonth: string;
  /** Server-prefetched stats for initialMonth, or null if prefetch failed
   * (e.g. no household yet) — client-side fetch takes over as fallback. */
  initialStats: StatsResponse | null;
}) {
  const [month, setMonth] = useState<string>(initialMonth);
  // Only the very first render for the server-prefetched month gets fallback
  // data; switching months falls back to normal client-side fetching.
  const fallbackData =
    month === initialMonth && initialStats ? initialStats : undefined;
  const { stats, isLoading, error, refresh } = useStats(month, fallbackData);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        actions={<MonthPicker month={month} onChange={setMonth} />}
      />

      {isLoading && !stats && (
        <div className="flex items-center justify-center gap-2 py-24 text-slate-400">
          <Spinner />
          <span className="text-sm">Loading…</span>
        </div>
      )}

      {!isLoading && error && !stats && (
        <Card>
          <EmptyState
            icon="⚠️"
            title="Couldn’t load the dashboard"
            hint={error}
            action={
              <Button variant="secondary" onClick={() => void refresh()}>
                Retry
              </Button>
            }
          />
        </Card>
      )}

      {stats && (
        hasNoActivity(stats) ? (
          <Card>
            <EmptyState
              icon="📥"
              title="No transactions yet"
              hint="Import a bank statement to get started."
              action={
                <Link href="/import">
                  <Button variant="primary">Import statement</Button>
                </Link>
              }
            />
          </Card>
        ) : (
          <div className="space-y-6">
            {/* The one thing to read first: what, if anything, needs a
                decision — ahead of the passive totals/charts below. */}
            <NeedsAttention stats={stats} />
            <StatCards stats={stats} />
            {/* lg (1024px), not xl (1280px): iPad landscape is exactly 1024px,
                and with the sidebar + padding there's still ~700px of content
                width there — comfortably enough for two charts side by side,
                so iPad landscape no longer renders identically to a phone.
                iPad portrait (768px) still correctly gets one column, since
                that's genuinely too narrow for two charts next to the
                sidebar. Laptop/desktop behaviour at lg+ is unchanged from
                before (xl was already ≤ lg-and-up territory). */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <SpendDonut
                byCategory={stats.byCategory}
                totalSpendPence={stats.totalSpendPence}
              />
              <BudgetBars budgets={stats.budgets} />
            </div>
            <TrendChart
              trend={stats.trend}
              totalBudgetPence={stats.budgets.reduce((s, b) => s + b.budgetPence, 0)}
            />
          </div>
        )
      )}
    </div>
  );
}
