import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type {
  BudgetProgress,
  CategorySpend,
  StatsResponse,
  TrendPoint,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const UNCAT_NAME = "Uncategorised";
const UNCAT_COLOR = "#475569";
const UNCAT_ICON = "❓";

/** Validate "yyyy-MM"; returns {year, mon(1-12)} or null. */
function parseMonth(month: string): { year: number; mon: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) return null;
  return { year, mon };
}

function currentMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthKey(year: number, mon0: number): string {
  return `${year}-${String(mon0 + 1).padStart(2, "0")}`;
}

type TxnWithCategory = Prisma.TransactionGetPayload<{
  include: { category: true };
}>;

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get("month");
    const month = monthParam && monthParam !== "" ? monthParam : currentMonth();

    const parsed = parseMonth(month);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid month" }, { status: 400 });
    }
    const { year, mon } = parsed; // mon is 1-12

    const monthStart = new Date(Date.UTC(year, mon - 1, 1));
    const monthEnd = new Date(Date.UTC(year, mon, 1));

    // ---- Selected month transactions (non-deleted = all; no soft delete) ----
    const monthTxns: TxnWithCategory[] = await prisma.transaction.findMany({
      where: { date: { gte: monthStart, lt: monthEnd } },
      include: { category: true },
    });

    const isTransfer = (t: TxnWithCategory): boolean =>
      t.category !== null && t.category.type === "transfer";

    let totalSpendPence = 0;
    let totalIncomePence = 0;
    let uncategorizedCount = 0;

    // byCategory: negative-amount rows grouped by category (transfers excluded).
    const catSpend = new Map<
      string | null,
      { name: string; color: string; icon: string; spendPence: number }
    >();

    for (const t of monthTxns) {
      if (t.categoryId === null) {
        uncategorizedCount++;
      }

      if (isTransfer(t)) continue;

      if (t.amountPence < 0) {
        const spend = -t.amountPence;
        totalSpendPence += spend;

        const key = t.categoryId;
        const existing = catSpend.get(key);
        if (existing) {
          existing.spendPence += spend;
        } else if (t.category) {
          catSpend.set(key, {
            name: t.category.name,
            color: t.category.color,
            icon: t.category.icon,
            spendPence: spend,
          });
        } else {
          catSpend.set(null, {
            name: UNCAT_NAME,
            color: UNCAT_COLOR,
            icon: UNCAT_ICON,
            spendPence: spend,
          });
        }
      } else if (t.amountPence > 0) {
        totalIncomePence += t.amountPence;
      }
    }

    const byCategory: CategorySpend[] = Array.from(catSpend.entries())
      .map(([categoryId, v]) => ({
        categoryId,
        name: v.name,
        color: v.color,
        icon: v.icon,
        spendPence: v.spendPence,
      }))
      .sort((a, b) => b.spendPence - a.spendPence);

    const netPence = totalIncomePence - totalSpendPence;

    // ---- Budgets: every Budget joined with its category ----
    const dbBudgets = await prisma.budget.findMany({
      include: { category: true },
    });
    const budgets: BudgetProgress[] = dbBudgets
      .map((b) => {
        const slice = catSpend.get(b.categoryId);
        return {
          categoryId: b.categoryId,
          name: b.category.name,
          color: b.category.color,
          icon: b.category.icon,
          budgetPence: b.amountPence,
          spentPence: slice ? slice.spendPence : 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    // ---- Trend: 12 points (11 months before through the selected month) ----
    const trendStart = new Date(Date.UTC(year, mon - 1 - 11, 1));
    const trendEnd = monthEnd; // exclusive end of selected month

    const trendTxns: TxnWithCategory[] = await prisma.transaction.findMany({
      where: { date: { gte: trendStart, lt: trendEnd } },
      include: { category: true },
    });

    // Seed 12 buckets in chronological order.
    const buckets = new Map<string, { spendPence: number; incomePence: number }>();
    const order: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(year, mon - 1 - i, 1));
      const key = monthKey(d.getUTCFullYear(), d.getUTCMonth());
      buckets.set(key, { spendPence: 0, incomePence: 0 });
      order.push(key);
    }

    for (const t of trendTxns) {
      if (isTransfer(t)) continue;
      const key = monthKey(t.date.getUTCFullYear(), t.date.getUTCMonth());
      const bucket = buckets.get(key);
      if (!bucket) continue;
      if (t.amountPence < 0) bucket.spendPence += -t.amountPence;
      else if (t.amountPence > 0) bucket.incomePence += t.amountPence;
    }

    const trend: TrendPoint[] = order.map((key) => {
      const b = buckets.get(key) ?? { spendPence: 0, incomePence: 0 };
      return { month: key, spendPence: b.spendPence, incomePence: b.incomePence };
    });

    const response: StatsResponse = {
      month,
      totalSpendPence,
      totalIncomePence,
      netPence,
      uncategorizedCount,
      byCategory,
      budgets,
      trend,
    };
    return NextResponse.json(response);
  } catch (err) {
    console.error("GET /api/stats", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
