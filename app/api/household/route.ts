import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser();
    if (!user || !user.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const existing = await prisma.householdMember.findFirst({
      where: { userId: user.id },
      select: { householdId: true },
    });
    if (existing) {
      return NextResponse.json({ householdId: existing.householdId });
    }

    const body = (await req.json().catch(() => ({}))) as { name?: unknown };
    const name =
      typeof body.name === "string" && body.name.trim() !== ""
        ? body.name.trim()
        : "Family household";

    const household = await prisma.household.create({
      data: {
        name,
        members: {
          create: {
            userId: user.id,
            email: user.email.toLowerCase(),
            role: "owner",
          },
        },
      },
    });

    return NextResponse.json(
      { householdId: household.id, role: "owner" },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/household", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const { user } = await requireAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const membership = await prisma.householdMember.findFirst({
      where: { userId: user.id },
      include: { household: true },
    });
    if (!membership) {
      return NextResponse.json({ household: null });
    }

    return NextResponse.json({
      household: membership.household,
      membership: {
        id: membership.id,
        email: membership.email,
        role: membership.role,
      },
    });
  } catch (error) {
    console.error("GET /api/household", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
