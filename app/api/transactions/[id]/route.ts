import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireHousehold, householdAccessError, withRlsUser } from "@/lib/auth/household";
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
    const context = await requireHousehold();
    if (!context.membership) {
      return NextResponse.json(householdAccessError(context.status), { status: context.status });
    }
    const householdId = context.membership.householdId;
    return await withRlsUser(context.userId, async (tx) => {
    const existing = await tx.transaction.findFirst({
      where: { id: params.id, householdId },
    });
    if (!existing || existing.householdId !== householdId) {
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
        const cat = await tx.category.findUnique({
          where: { id: categoryId },
        });
        if (!cat || cat.householdId !== householdId) {
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

    const updated = await tx.transaction.update({
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

      await tx.categoryRule.upsert({
        where: { householdId_pattern: { householdId, pattern } },
        create: { pattern, categoryId: resolvedCategoryId, householdId },
        update: { categoryId: resolvedCategoryId },
      });

      if (body.createRule.applyToExisting) {
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
            data: { categoryId: resolvedCategoryId, categorySource: "rule" },
          });
        }
      }
    }

    return NextResponse.json(toTxnDTO(updated));
    });
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
    const context = await requireHousehold();
    if (!context.membership) {
      return NextResponse.json(householdAccessError(context.status), { status: context.status });
    }
    return await withRlsUser(context.userId, async (tx) => {
    const existing = await tx.transaction.findFirst({
      where: { id: params.id, householdId: context.membership.householdId },
    });
    if (!existing || existing.householdId !== context.membership.householdId) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }
    await tx.transaction.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
    });
  } catch (err) {
    console.error("DELETE /api/transactions/[id]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
