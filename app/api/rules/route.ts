import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireHousehold, householdAccessError, withRlsUser } from "@/lib/auth/household";
import { normalizeDescription } from "@/lib/categorize";
import type { CreateRuleRequest, RuleDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const context = await requireHousehold();
    if (!context.membership) {
      return NextResponse.json(householdAccessError(context.status), { status: context.status });
    }
    const householdId = context.membership.householdId;
    return await withRlsUser(context.userId, async (tx) => {
    const rules = await tx.categoryRule.findMany({
      where: { householdId },
      include: { category: true },
      orderBy: { createdAt: "desc" },
    });

    const body: RuleDTO[] = rules.map((r) => ({
      id: r.id,
      pattern: r.pattern,
      category: {
        id: r.category.id,
        name: r.category.name,
        color: r.category.color,
        icon: r.category.icon,
        type: r.category.type,
      },
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json(body);
    });
  } catch (err) {
    console.error("GET /api/rules", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const context = await requireHousehold();
    if (!context.membership) {
      return NextResponse.json(householdAccessError(context.status), { status: context.status });
    }
    const householdId = context.membership.householdId;
    return await withRlsUser(context.userId, async (tx) => {
    const body = (await req.json()) as CreateRuleRequest;

    const pattern =
      typeof body.pattern === "string" ? body.pattern.toUpperCase().trim() : "";
    if (pattern === "") {
      return NextResponse.json(
        { error: "Rule pattern must not be empty" },
        { status: 400 }
      );
    }
    if (typeof body.categoryId !== "string" || body.categoryId === "") {
      return NextResponse.json(
        { error: "categoryId is required" },
        { status: 400 }
      );
    }

    const category = await tx.category.findUnique({
      where: { id: body.categoryId },
    });
    if (!category || category.householdId !== householdId) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 400 }
      );
    }

    const rule = await tx.categoryRule.upsert({
      where: { householdId_pattern: { householdId, pattern } },
      create: { pattern, categoryId: body.categoryId, householdId },
      update: { categoryId: body.categoryId },
      include: { category: true },
    });

    if (body.applyToExisting) {
      const candidates = await tx.transaction.findMany({
        where: { categorySource: { in: ["none", "builtin", "rule"] }, householdId },
        select: { id: true, description: true },
      });
      const matchIds = candidates
        .filter((t) => normalizeDescription(t.description).includes(pattern))
        .map((t) => t.id);
      if (matchIds.length > 0) {
        await tx.transaction.updateMany({
          where: { id: { in: matchIds }, householdId },
          data: { categoryId: body.categoryId, categorySource: "rule" },
        });
      }
    }

    const dto: RuleDTO = {
      id: rule.id,
      pattern: rule.pattern,
      category: {
        id: rule.category.id,
        name: rule.category.name,
        color: rule.category.color,
        icon: rule.category.icon,
        type: rule.category.type,
      },
      createdAt: rule.createdAt.toISOString(),
    };
    return NextResponse.json(dto, { status: 201 });
    });
  } catch (err) {
    console.error("POST /api/rules", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
