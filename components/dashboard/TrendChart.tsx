"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";
import { Card, CardTitle } from "@/components/ui";
import { formatMonth, formatMonthShort, formatPence } from "@/lib/format";
import type { TrendPoint } from "@/lib/types";

const compactGbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** pence → compact £ for Y axis ticks */
function formatPounds(pence: number): string {
  return compactGbp.format(pence / 100);
}

function TrendTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-slate-200">
        {formatMonth(String(label))}
      </div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span style={{ color: p.color }}>
            {p.dataKey === "spendPence" ? "Spend" : "Income"}
          </span>
          <span className="tabular-nums text-slate-300">
            {formatPence(p.value ?? 0)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function TrendChart({
  trend,
  totalBudgetPence,
}: {
  trend: TrendPoint[];
  /** Sum of all current monthly budgets, or 0 if none are set. Budgets apply
   * to every month the same way (lib/types.ts: "recurring monthly budget"),
   * so one flat reference line is historically honest even though it's
   * drawn against past months. Omitted entirely when there's no budget to
   * compare against. */
  totalBudgetPence?: number;
}) {
  const showBudgetLine = (totalBudgetPence ?? 0) > 0;

  return (
    <Card>
      <CardTitle>12-month trend</CardTitle>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={trend}
            margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
          >
            <CartesianGrid stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonthShort}
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "#334155" }}
            />
            <YAxis
              tickFormatter={formatPounds}
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip
              content={<TrendTooltip />}
              cursor={{ fill: "#1e293b66" }}
            />
            <Bar
              dataKey="spendPence"
              fill="#f87171"
              radius={[3, 3, 0, 0]}
              maxBarSize={28}
            />
            <Line
              type="monotone"
              dataKey="incomePence"
              stroke="#34d399"
              strokeWidth={2}
              dot={false}
            />
            {showBudgetLine && (
              <ReferenceLine
                y={totalBudgetPence}
                stroke="#fbbf24"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: "Budget",
                  position: "insideTopRight",
                  fill: "#fbbf24",
                  fontSize: 11,
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
