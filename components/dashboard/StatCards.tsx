"use client";

import { Card } from "@/components/ui";
import { formatPence } from "@/lib/format";
import type { StatsResponse } from "@/lib/types";

function StatCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <Card>
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${valueClass}`}>
        {value}
      </div>
    </Card>
  );
}

export default function StatCards({ stats }: { stats: StatsResponse }) {
  const netClass =
    stats.netPence > 0
      ? "text-emerald-400"
      : stats.netPence < 0
        ? "text-red-400"
        : "text-slate-200";

  return (
    // Three pure totals only — "Uncategorised" moved to NeedsAttention above
    // this grid, alongside the other action items, rather than sitting here
    // as a fourth passive total it never was.
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        label="Income"
        value={formatPence(stats.totalIncomePence)}
        valueClass="text-emerald-400"
      />
      <StatCard
        label="Spending"
        value={formatPence(-stats.totalSpendPence)}
        valueClass="text-red-400"
      />
      <StatCard label="Net" value={formatPence(stats.netPence)} valueClass={netClass} />
    </div>
  );
}
