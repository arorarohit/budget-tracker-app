"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import MonthPicker from "@/components/MonthPicker";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
} from "@/components/ui";
import { currentMonth } from "@/lib/format";
import type { StatsResponse } from "@/lib/types";
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

export default function DashboardPage() {
  const [month, setMonth] = useState<string>(currentMonth());
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stats?month=${encodeURIComponent(m)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? `Failed to load stats (${res.status})`);
      }
      const data = (await res.json()) as StatsResponse;
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stats");
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(month);
  }, [month, load]);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        actions={<MonthPicker month={month} onChange={setMonth} />}
      />

      {loading && (
        <div className="flex items-center justify-center gap-2 py-24 text-slate-400">
          <Spinner />
          <span className="text-sm">Loading…</span>
        </div>
      )}

      {!loading && error && (
        <Card>
          <EmptyState
            icon="⚠️"
            title="Couldn’t load the dashboard"
            hint={error}
            action={
              <Button variant="secondary" onClick={() => void load(month)}>
                Retry
              </Button>
            }
          />
        </Card>
      )}

      {!loading && !error && stats && (
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
            <StatCards stats={stats} />
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <SpendDonut
                byCategory={stats.byCategory}
                totalSpendPence={stats.totalSpendPence}
              />
              <BudgetBars budgets={stats.budgets} />
            </div>
            <TrendChart trend={stats.trend} />
          </div>
        )
      )}
    </div>
  );
}
