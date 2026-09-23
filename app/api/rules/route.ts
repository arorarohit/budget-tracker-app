import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeDescription } from "@/lib/categorize";
import type { CreateRuleRequest, RuleDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const rules = await prisma.categoryRule.findMany({
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
  } catch (err) {
    console.error("GET /api/rules", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
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

    const category = await prisma.category.findUnique({
      where: { id: body.categoryId },
    });
    if (!category) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 400 }
      );
    }

    const rule = await prisma.categoryRule.upsert({
      where: { pattern },
      create: { pattern, categoryId: body.categoryId },
      update: { categoryId: body.categoryId },
      include: { category: true },
    });

    if (body.applyToExisting) {
      const candidates = await prisma.transaction.findMany({
        where: { categorySource: { in: ["none", "builtin", "rule"] } },
        select: { id: true, description: true },
      });
      const matchIds = candidates
        .filter((t) => normalizeDescription(t.description).includes(pattern))
        .map((t) => t.id);
      if (matchIds.length > 0) {
        await prisma.transaction.updateMany({
          where: { id: { in: matchIds } },
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
  } catch (err) {
    console.error("POST /api/rules", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
