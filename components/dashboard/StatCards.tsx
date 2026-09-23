"use client";

import Link from "next/link";
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      {stats.uncategorizedCount > 0 ? (
        <Link
          href="/transactions?uncategorized=true"
          className="group block rounded-xl border border-amber-800/70 bg-amber-950/30 p-5 transition-colors hover:border-amber-600 hover:bg-amber-950/50"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-400/80">
            Uncategorised
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-amber-300">
            {stats.uncategorizedCount}
          </div>
          <div className="mt-1 text-xs font-medium text-amber-400/70 group-hover:text-amber-300">
            Review &amp; categorise →
          </div>
        </Link>
      ) : (
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Uncategorised
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-slate-500">0</div>
          <div className="mt-1 text-xs text-slate-500">All sorted ✓</div>
        </Card>
      )}
    </div>
  );
}
