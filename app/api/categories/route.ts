import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { CategoryDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_TYPES = ["expense", "income", "transfer"];

export async function GET(): Promise<NextResponse> {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      include: {
        budget: true,
        _count: { select: { transactions: true } },
      },
    });

    const body: CategoryDTO[] = categories.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      color: c.color,
      icon: c.icon,
      txnCount: c._count.transactions,
      budgetPence: c.budget ? c.budget.amountPence : null,
    }));

    return NextResponse.json(body);
  } catch (err) {
    console.error("GET /api/categories", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json()) as {
      name?: unknown;
      type?: unknown;
      color?: unknown;
      icon?: unknown;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name === "") {
      return NextResponse.json(
        { error: "Category name is required" },
        { status: 400 }
      );
    }

    const type =
      typeof body.type === "string" && VALID_TYPES.includes(body.type)
        ? body.type
        : "expense";

    const existing = await prisma.category.findUnique({ where: { name } });
    if (existing) {
      return NextResponse.json(
        { error: "A category with that name already exists" },
        { status: 400 }
      );
    }

    const data: {
      name: string;
      type: string;
      color?: string;
      icon?: string;
    } = { name, type };
    if (typeof body.color === "string" && body.color !== "")
      data.color = body.color;
    if (typeof body.icon === "string" && body.icon !== "") data.icon = body.icon;

    const created = await prisma.category.create({ data });

    const dto: CategoryDTO = {
      id: created.id,
      name: created.name,
      type: created.type,
      color: created.color,
      icon: created.icon,
      txnCount: 0,
      budgetPence: null,
    };
    return NextResponse.json(dto, { status: 201 });
  } catch (err) {
    console.error("POST /api/categories", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
