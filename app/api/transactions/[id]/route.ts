import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeDescription } from "@/lib/categorize";
import type { TxnDTO, UpdateTransactionRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

type TxnWithRelations = Prisma.TransactionGetPayload<{
  include: { category: true; account: true };
}>;

function toTxnDTO(t: TxnWithRelations): TxnDTO {
  return {
    id: t.id,
    date: t.date.toISOString().slice(0, 10),
    description: t.description,
    merchant: t.merchant,
    amountPence: t.amountPence,
    source: t.source,
    notes: t.notes,
    categorySource: t.categorySource,
    category: t.category
      ? {
          id: t.category.id,
          name: t.category.name,
          color: t.category.color,
          icon: t.category.icon,
          type: t.category.type,
        }
      : null,
    account: t.account
      ? { id: t.account.id, name: t.account.name, type: t.account.type }
      : null,
  };
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const existing = await prisma.transaction.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    const body = (await req.json()) as UpdateTransactionRequest;
    const data: Prisma.TransactionUpdateInput = {};

    // categoryId handling
    let resolvedCategoryId: string | null | undefined;
    if (Object.prototype.hasOwnProperty.call(body, "categoryId")) {
      const categoryId = body.categoryId;
      if (categoryId === null || categoryId === undefined || categoryId === "") {
        resolvedCategoryId = null;
        data.category = { disconnect: true };
        data.categorySource = "none";
      } else {
        const cat = await prisma.category.findUnique({
          where: { id: categoryId },
        });
        if (!cat) {
          return NextResponse.json(
            { error: "Category not found" },
            { status: 400 }
          );
        }
        resolvedCategoryId = categoryId;
        data.category = { connect: { id: categoryId } };
        data.categorySource = "manual";
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "notes")) {
      data.notes =
        typeof body.notes === "string" && body.notes !== "" ? body.notes : null;
    }

    const updated = await prisma.transaction.update({
      where: { id: params.id },
      data,
      include: { category: true, account: true },
    });

    // createRule — only valid alongside a non-null categoryId
    if (body.createRule && resolvedCategoryId) {
      const rawPattern = body.createRule.pattern ?? "";
      const pattern = rawPattern.toUpperCase().trim();
      if (pattern === "") {
        return NextResponse.json(
          { error: "Rule pattern must not be empty" },
          { status: 400 }
        );
      }

      await prisma.categoryRule.upsert({
        where: { pattern },
        create: { pattern, categoryId: resolvedCategoryId },
        update: { categoryId: resolvedCategoryId },
      });

      if (body.createRule.applyToExisting) {
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
            data: { categoryId: resolvedCategoryId, categorySource: "rule" },
          });
        }
      }
    }

    return NextResponse.json(toTxnDTO(updated));
  } catch (err) {
    console.error("PATCH /api/transactions/[id]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const existing = await prisma.transaction.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }
    await prisma.transaction.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/transactions/[id]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
