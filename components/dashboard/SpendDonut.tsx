"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Card, CardTitle, EmptyState } from "@/components/ui";
import { formatPence, formatPenceAbs } from "@/lib/format";
import type { CategorySpend } from "@/lib/types";

export default function SpendDonut({
  byCategory,
  totalSpendPence,
}: {
  byCategory: CategorySpend[];
  totalSpendPence: number;
}) {
  const slices = byCategory.filter((c) => c.spendPence > 0);

  return (
    <Card>
      <CardTitle>Spending by category</CardTitle>
      {slices.length === 0 ? (
        <EmptyState icon="🥧" title="No spending this month" />
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <div className="relative h-72 w-full sm:w-1/2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="spendPence"
                  nameKey="name"
                  innerRadius="60%"
                  outerRadius="85%"
                  paddingAngle={1}
                  stroke="none"
                >
                  {slices.map((s) => (
                    <Cell key={s.categoryId ?? "uncategorized"} fill={s.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-xs uppercase tracking-wider text-slate-500">
                Total spend
              </div>
              <div className="text-xl font-bold tabular-nums text-slate-100">
                {formatPenceAbs(totalSpendPence)}
              </div>
            </div>
          </div>

          <ul className="w-full space-y-2 sm:w-1/2">
            {slices.map((s) => {
              const share =
                totalSpendPence > 0
                  ? Math.round((s.spendPence / totalSpendPence) * 100)
                  : 0;
              return (
                <li
                  key={s.categoryId ?? "uncategorized"}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="shrink-0">{s.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-300">
                    {s.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-200">
                    {formatPence(-s.spendPence)}
                  </span>
                  <span className="w-10 shrink-0 text-right tabular-nums text-xs text-slate-500">
                    {share}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
