import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { AccountDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_TYPES = ["current", "savings", "credit_card"];

export async function GET(): Promise<NextResponse> {
  try {
    const accounts = await prisma.account.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { transactions: true } } },
    });

    const body: AccountDTO[] = accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      institution: a.institution,
      txnCount: a._count.transactions,
    }));

    return NextResponse.json(body);
  } catch (err) {
    console.error("GET /api/accounts", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json()) as {
      name?: unknown;
      type?: unknown;
      institution?: unknown;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name === "") {
      return NextResponse.json(
        { error: "Account name is required" },
        { status: 400 }
      );
    }

    const type =
      typeof body.type === "string" && VALID_TYPES.includes(body.type)
        ? body.type
        : "current";

    const existing = await prisma.account.findUnique({ where: { name } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with that name already exists" },
        { status: 400 }
      );
    }

    const created = await prisma.account.create({
      data: {
        name,
        type,
        institution:
          typeof body.institution === "string" ? body.institution : "",
      },
    });

    const dto: AccountDTO = {
      id: created.id,
      name: created.name,
      type: created.type,
      institution: created.institution,
      txnCount: 0,
    };
    return NextResponse.json(dto, { status: 201 });
  } catch (err) {
    console.error("POST /api/accounts", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
