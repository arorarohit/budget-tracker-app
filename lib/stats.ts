import { Prisma, type PrismaClient } from "@prisma/client";
import type { BudgetProgress, CategorySpend, StatsResponse, TrendPoint } from "@/lib/types";

const UNCAT_NAME = "Uncategorised";
const UNCAT_COLOR = "#475569";
const UNCAT_ICON = "❓";

/** Validate "yyyy-MM"; returns {year, mon(1-12)} or null. */
export function parseMonth(month: string): { year: number; mon: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) return null;
  return { year, mon };
}

export function currentMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

interface TrendRow {
  month: string; // "YYYY-MM", from to_char(date_trunc(...))
  spend_pence: bigint | number;
  income_pence: bigint | number;
}

type QueryableClient = Pick<PrismaClient, "category" | "transaction" | "budget" | "$queryRaw">;

/**
 * Core stats aggregation, shared by the `/api/stats` route handler and any
 * Server Component that wants to prefetch the same data at render time
 * (e.g. the Dashboard page shell, to avoid a client-side fetch + spinner on
 * first paint). Pushes all aggregation down to SQL — see the historical
 * note in app/api/stats/route.ts for why this replaced full in-memory
 * transaction loops.
 */
export async function computeStats(
  tx: QueryableClient,
  householdId: string,
  month: string
): Promise<StatsResponse | null> {
  const parsed = parseMonth(month);
  if (!parsed) return null;
  const { year, mon } = parsed; // mon is 1-12

  const monthStart = new Date(Date.UTC(year, mon - 1, 1));
  const monthEnd = new Date(Date.UTC(year, mon, 1));

  const categories = await tx.category.findMany({
    where: { householdId },
    select: { id: true, name: true, color: true, icon: true, type: true },
  });
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const transferCategoryIds = categories
    .filter((c) => c.type === "transfer")
    .map((c) => c.id);

  const [uncategorizedCount, spendGroups, incomeAgg] = await Promise.all([
    tx.transaction.count({
      where: { householdId, date: { gte: monthStart, lt: monthEnd }, categoryId: null },
    }),
    tx.transaction.groupBy({
      by: ["categoryId"],
      where: {
        householdId,
        date: { gte: monthStart, lt: monthEnd },
        amountPence: { lt: 0 },
        OR: [{ categoryId: null }, { categoryId: { notIn: transferCategoryIds } }],
      },
      _sum: { amountPence: true },
    }),
    tx.transaction.aggregate({
      where: {
        householdId,
        date: { gte: monthStart, lt: monthEnd },
        amountPence: { gt: 0 },
        OR: [{ categoryId: null }, { categoryId: { notIn: transferCategoryIds } }],
      },
      _sum: { amountPence: true },
    }),
  ]);

  const byCategory: CategorySpend[] = spendGroups
    .map((g) => {
      const spendPence = -(g._sum.amountPence ?? 0);
      const cat = g.categoryId ? categoryById.get(g.categoryId) : undefined;
      return {
        categoryId: g.categoryId,
        name: cat ? cat.name : UNCAT_NAME,
        color: cat ? cat.color : UNCAT_COLOR,
        icon: cat ? cat.icon : UNCAT_ICON,
        spendPence,
      };
    })
    .sort((a, b) => b.spendPence - a.spendPence);

  const totalSpendPence = byCategory.reduce((sum, c) => sum + c.spendPence, 0);
  const totalIncomePence = incomeAgg._sum.amountPence ?? 0;
  const netPence = totalIncomePence - totalSpendPence;

  const spendByCategoryId = new Map<string, number>();
  for (const c of byCategory) {
    if (c.categoryId) spendByCategoryId.set(c.categoryId, c.spendPence);
  }

  const dbBudgets = await tx.budget.findMany({
    where: { householdId },
    include: { category: true },
  });
  const budgets: BudgetProgress[] = dbBudgets
    .map((b) => ({
      categoryId: b.categoryId,
      name: b.category.name,
      color: b.category.color,
      icon: b.category.icon,
      budgetPence: b.amountPence,
      spentPence: spendByCategoryId.get(b.categoryId) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const trendStart = new Date(Date.UTC(year, mon - 1 - 11, 1));
  const trendEnd = monthEnd;

  const trendRows = await tx.$queryRaw<TrendRow[]>(Prisma.sql`
    SELECT
      to_char(date_trunc('month', "date"), 'YYYY-MM') AS month,
      COALESCE(SUM(CASE WHEN "amountPence" < 0 THEN -"amountPence" ELSE 0 END), 0) AS spend_pence,
      COALESCE(SUM(CASE WHEN "amountPence" > 0 THEN "amountPence" ELSE 0 END), 0) AS income_pence
    FROM "Transaction"
    WHERE "householdId" = ${householdId}
      AND "date" >= ${trendStart}
      AND "date" < ${trendEnd}
      AND (
        "categoryId" IS NULL
        OR "categoryId" NOT IN (
          SELECT id FROM "Category" WHERE "householdId" = ${householdId} AND type = 'transfer'
        )
      )
    GROUP BY 1
    ORDER BY 1
  `);

  const trendByMonth = new Map<string, { spendPence: number; incomePence: number }>();
  for (const row of trendRows) {
    trendByMonth.set(row.month, {
      spendPence: Number(row.spend_pence),
      incomePence: Number(row.income_pence),
    });
  }

  const trend: TrendPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(year, mon - 1 - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = trendByMonth.get(key) ?? { spendPence: 0, incomePence: 0 };
    trend.push({ month: key, spendPence: bucket.spendPence, incomePence: bucket.incomePence });
  }

  return {
    month,
    totalSpendPence,
    totalIncomePence,
    netPence,
    uncategorizedCount,
    byCategory,
    budgets,
    trend,
  };
}
