import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canManageMembers, requireHousehold } from "@/lib/auth/household";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const context = await requireHousehold();
  if (!context.membership) {
    return NextResponse.json(
      { error: context.status === 401 ? "Authentication required" : "Household membership required" },
      { status: context.status }
    );
  }

  const members = await prisma.householdMember.findMany({
    where: { householdId: context.membership.householdId },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, role: true, createdAt: true },
  });
  return NextResponse.json(members);
}

export async function POST(req: Request): Promise<NextResponse> {
  const context = await requireHousehold();
  if (!context.membership) {
    return NextResponse.json(
      { error: context.status === 401 ? "Authentication required" : "Household membership required" },
      { status: context.status }
    );
  }
  if (!canManageMembers(context.membership.role)) {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as { email?: unknown; role?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = body.role === "admin" ? "admin" : "member";
    if (!email) {
      return NextResponse.json({ error: "Registered email is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;
    const registeredUser = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (!registeredUser) {
      return NextResponse.json(
        { error: "The user must register before being added to the household" },
        { status: 400 }
      );
    }

    const member = await prisma.householdMember.create({
      data: {
        householdId: context.membership.householdId,
        userId: registeredUser.id,
        email,
        role,
      },
      select: { id: true, email: true, role: true, createdAt: true },
    });
    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    console.error("POST /api/household/members", error);
    return NextResponse.json({ error: "Could not add household member" }, { status: 400 });
  }
}
