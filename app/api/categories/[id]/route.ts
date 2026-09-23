import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { CategoryDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_TYPES = ["expense", "income", "transfer"];

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const existing = await prisma.category.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    const body = (await req.json()) as Partial<{
      name: string;
      type: string;
      color: string;
      icon: string;
    }>;

    const data: {
      name?: string;
      type?: string;
      color?: string;
      icon?: string;
    } = {};

    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (name === "") {
        return NextResponse.json(
          { error: "Category name must not be empty" },
          { status: 400 }
        );
      }
      const clash = await prisma.category.findUnique({ where: { name } });
      if (clash && clash.id !== params.id) {
        return NextResponse.json(
          { error: "A category with that name already exists" },
          { status: 400 }
        );
      }
      data.name = name;
    }

    if (Object.prototype.hasOwnProperty.call(body, "type")) {
      if (typeof body.type !== "string" || !VALID_TYPES.includes(body.type)) {
        return NextResponse.json(
          { error: "Invalid category type" },
          { status: 400 }
        );
      }
      data.type = body.type;
    }

    if (
      Object.prototype.hasOwnProperty.call(body, "color") &&
      typeof body.color === "string" &&
      body.color !== ""
    ) {
      data.color = body.color;
    }
    if (
      Object.prototype.hasOwnProperty.call(body, "icon") &&
      typeof body.icon === "string" &&
      body.icon !== ""
    ) {
      data.icon = body.icon;
    }

    const updated = await prisma.category.update({
      where: { id: params.id },
      data,
      include: {
        budget: true,
        _count: { select: { transactions: true } },
      },
    });

    const dto: CategoryDTO = {
      id: updated.id,
      name: updated.name,
      type: updated.type,
      color: updated.color,
      icon: updated.icon,
      txnCount: updated._count.transactions,
      budgetPence: updated.budget ? updated.budget.amountPence : null,
    };
    return NextResponse.json(dto);
  } catch (err) {
    console.error("PATCH /api/categories/[id]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const existing = await prisma.category.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    // First mark this category's transactions uncategorised (categorySource
    // "none"); the FK SetNull then clears categoryId, and budgets/rules cascade
    // on category delete.
    await prisma.transaction.updateMany({
      where: { categoryId: params.id },
      data: { categorySource: "none" },
    });

    await prisma.category.delete({ where: { id: params.id } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/categories/[id]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
