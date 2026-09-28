import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireHousehold, householdAccessError, withRlsUser } from "@/lib/auth/household";
import type { BudgetDTO, SetBudgetsRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

async function listBudgets(tx: Prisma.TransactionClient, householdId: string): Promise<BudgetDTO[]> {
  const budgets = await tx.budget.findMany({
    where: { householdId },
    include: { category: true },
  });
  return budgets
    .map((b) => ({
      categoryId: b.categoryId,
      name: b.category.name,
      color: b.category.color,
      icon: b.category.icon,
      amountPence: b.amountPence,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET(): Promise<NextResponse> {
  try {
    const context = await requireHousehold();
    if (!context.membership) {
      return NextResponse.json(householdAccessError(context.status), { status: context.status });
    }
    return await withRlsUser(context.userId, async (tx) =>
      NextResponse.json(await listBudgets(tx, context.membership.householdId))
    );
  } catch (err) {
    console.error("GET /api/budgets", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(req: Request): Promise<NextResponse> {
  try {
    const context = await requireHousehold();
    if (!context.membership) {
      return NextResponse.json(householdAccessError(context.status), { status: context.status });
    }
    const householdId = context.membership.householdId;
    return await withRlsUser(context.userId, async (tx) => {
    const body = (await req.json()) as SetBudgetsRequest;
    if (!body || !Array.isArray(body.budgets)) {
      return NextResponse.json(
        { error: "budgets array is required" },
        { status: 400 }
      );
    }

    // Validate shape + category existence up front.
    for (const entry of body.budgets) {
      if (!entry || typeof entry.categoryId !== "string" || entry.categoryId === "") {
        return NextResponse.json(
          { error: "Each budget requires a categoryId" },
          { status: 400 }
        );
      }
      if (entry.amountPence !== null) {
        if (
          typeof entry.amountPence !== "number" ||
          !Number.isInteger(entry.amountPence) ||
          entry.amountPence < 0
        ) {
          return NextResponse.json(
            { error: "amountPence must be a non-negative integer or null" },
            { status: 400 }
          );
        }
      }
    }

    const ids = Array.from(new Set(body.budgets.map((b) => b.categoryId)));
    const found = await tx.category.findMany({
      where: { id: { in: ids }, householdId },
      select: { id: true },
    });
    const foundIds = new Set(found.map((c) => c.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Unknown categor${missing.length === 1 ? "y" : "ies"}: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    await Promise.all(
      body.budgets.map((entry) => {
        if (entry.amountPence === null) {
          return tx.budget.deleteMany({
            where: { categoryId: entry.categoryId, householdId },
          });
        }
        return tx.budget.upsert({
          where: { categoryId: entry.categoryId },
          create: {
            categoryId: entry.categoryId,
            householdId,
            amountPence: entry.amountPence,
          },
          update: { amountPence: entry.amountPence },
        });
      })
    );

    return NextResponse.json(await listBudgets(tx, householdId));
    });
  } catch (err) {
    console.error("PUT /api/budgets", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
