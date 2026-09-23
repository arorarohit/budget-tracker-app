import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type {
  CreateTransactionRequest,
  TransactionListResponse,
  TxnDTO,
} from "@/lib/types";

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

/** Month "yyyy-MM" → [first day, first day of next month) as UTC dates. */
function monthRange(month: string): { gte: Date; lt: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) return null;
  const gte = new Date(Date.UTC(year, mon - 1, 1));
  const lt = new Date(Date.UTC(year, mon, 1));
  return { gte, lt };
}

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    const categoryId = searchParams.get("categoryId");
    const accountId = searchParams.get("accountId");
    const q = searchParams.get("q");
    const uncategorized = searchParams.get("uncategorized");

    const where: Prisma.TransactionWhereInput = {};

    if (month) {
      const range = monthRange(month);
      if (!range) {
        return NextResponse.json({ error: "Invalid month" }, { status: 400 });
      }
      where.date = { gte: range.gte, lt: range.lt };
    }

    if (uncategorized === "true") {
      where.categoryId = null;
    } else if (categoryId) {
      if (categoryId === "none") {
        where.categoryId = null;
      } else {
        where.categoryId = categoryId;
      }
    }

    if (accountId) {
      where.accountId = accountId;
    }

    if (q) {
      where.OR = [
        { description: { contains: q } },
        { merchant: { contains: q } },
        { notes: { contains: q } },
      ];
    }

    const limitRaw = Number(searchParams.get("limit"));
    const offsetRaw = Number(searchParams.get("offset"));
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(Math.floor(limitRaw), 200)
        : 50;
    const offset =
      Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;

    const [rows, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: { category: true, account: true },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: limit,
        skip: offset,
      }),
      prisma.transaction.count({ where }),
    ]);

    const body: TransactionListResponse = {
      transactions: rows.map(toTxnDTO),
      total,
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error("GET /api/transactions", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json()) as CreateTransactionRequest;

    if (
      !body ||
      typeof body.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.date) ||
      typeof body.description !== "string" ||
      body.description.trim() === "" ||
      typeof body.amountPence !== "number" ||
      !Number.isInteger(body.amountPence)
    ) {
      return NextResponse.json(
        { error: "Invalid transaction payload" },
        { status: 400 }
      );
    }

    const categoryId =
      typeof body.categoryId === "string" && body.categoryId !== ""
        ? body.categoryId
        : null;
    const accountId =
      typeof body.accountId === "string" && body.accountId !== ""
        ? body.accountId
        : null;

    if (categoryId) {
      const cat = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!cat) {
        return NextResponse.json(
          { error: "Category not found" },
          { status: 400 }
        );
      }
    }
    if (accountId) {
      const acc = await prisma.account.findUnique({ where: { id: accountId } });
      if (!acc) {
        return NextResponse.json(
          { error: "Account not found" },
          { status: 400 }
        );
      }
    }

    const created = await prisma.transaction.create({
      data: {
        date: new Date(body.date + "T00:00:00.000Z"),
        description: body.description,
        merchant: null,
        amountPence: body.amountPence,
        source: "manual",
        notes:
          typeof body.notes === "string" && body.notes !== ""
            ? body.notes
            : null,
        categoryId,
        categorySource: categoryId ? "manual" : "none",
        accountId,
      },
      include: { category: true, account: true },
    });

    return NextResponse.json(toTxnDTO(created), { status: 201 });
  } catch (err) {
    console.error("POST /api/transactions", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
