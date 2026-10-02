"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Card, CardTitle, EmptyState } from "@/components/ui";
import { formatPence, formatPenceAbs } from "@/lib/format";
import type { CategorySpend } from "@/lib/types";

const MAX_PIE_SLICES = 5;
const OTHER_COLOR = "#64748b";

/** Collapse everything past the top N categories into a single "Other" slice
 * for the PIE ONLY — a wheel with 8+ thin slices is decorative, nobody can
 * rank 8 colors by eye. The legend list below stays fully detailed and
 * individually ranked, since that's where the real category-by-category
 * read happens; the chart's job is just "where does most of it go". */
function buildPieSlices(
  sorted: CategorySpend[]
): Array<{ key: string; name: string; color: string; spendPence: number }> {
  const top = sorted.slice(0, MAX_PIE_SLICES);
  const rest = sorted.slice(MAX_PIE_SLICES);
  const otherTotal = rest.reduce((sum, c) => sum + c.spendPence, 0);

  const slices = top.map((c) => ({
    key: c.categoryId ?? "uncategorized",
    name: c.name,
    color: c.color,
    spendPence: c.spendPence,
  }));
  if (otherTotal > 0) {
    slices.push({ key: "__other__", name: "Other", color: OTHER_COLOR, spendPence: otherTotal });
  }
  return slices;
}

export default function SpendDonut({
  byCategory,
  totalSpendPence,
}: {
  byCategory: CategorySpend[];
  totalSpendPence: number;
}) {
  // byCategory already arrives sorted desc by spendPence (see lib/stats.ts).
  const ranked = byCategory.filter((c) => c.spendPence > 0);
  const pieSlices = buildPieSlices(ranked);

  return (
    <Card>
      <CardTitle>Spending by category</CardTitle>
      {ranked.length === 0 ? (
        <EmptyState icon="🥧" title="No spending this month" />
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <div className="relative h-72 w-full sm:w-1/2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieSlices}
                  dataKey="spendPence"
                  nameKey="name"
                  innerRadius="60%"
                  outerRadius="85%"
                  paddingAngle={1}
                  stroke="none"
                >
                  {pieSlices.map((s) => (
                    <Cell key={s.key} fill={s.color} />
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

          {/* Full ranked list, every category individually — this is the part
              that actually communicates, the pie just orients at a glance. */}
          <ul className="w-full space-y-2 sm:w-1/2">
            {ranked.map((s) => {
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
