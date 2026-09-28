import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  canManageMembers,
  householdAccessError,
  requireHousehold,
  withRlsUser,
} from "@/lib/auth/household";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function accessResponse(context: Awaited<ReturnType<typeof requireHousehold>>) {
  return context.membership
    ? null
    : NextResponse.json(householdAccessError(context.status), {
        status: context.status,
      });
}

export async function GET(): Promise<NextResponse> {
  const context = await requireHousehold();
  const denied = accessResponse(context);
  if (denied) return denied;
  const membership = context.membership;
  if (!membership) return NextResponse.json({ error: "Household membership required" }, { status: 403 });
  const members = await withRlsUser(context.userId, (tx) =>
    tx.householdMember.findMany({
      where: { householdId: membership.householdId },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, role: true, createdAt: true },
    })
  );
  return NextResponse.json(members);
}

export async function POST(req: Request): Promise<NextResponse> {
  const context = await requireHousehold();
  const denied = accessResponse(context);
  if (denied) return denied;
  const membership = context.membership;
  if (!membership) return NextResponse.json({ error: "Household membership required" }, { status: 403 });
  if (!canManageMembers(membership.role)) {
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
    const registeredUser = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email
    );
    if (!registeredUser) {
      return NextResponse.json(
        { error: "The user must register before being added to the household" },
        { status: 400 }
      );
    }

    const member = await prisma.householdMember.create({
      data: {
        householdId: membership.householdId,
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

export async function PATCH(req: Request): Promise<NextResponse> {
  const context = await requireHousehold();
  const denied = accessResponse(context);
  if (denied) return denied;
  const membership = context.membership;
  if (!membership) return NextResponse.json({ error: "Household membership required" }, { status: 403 });
  if (!canManageMembers(membership.role)) {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as { memberId?: unknown; role?: unknown };
    const memberId = typeof body.memberId === "string" ? body.memberId : "";
    const role = body.role === "admin" || body.role === "member" ? body.role : "";
    if (!memberId || !role) {
      return NextResponse.json({ error: "memberId and a valid role are required" }, { status: 400 });
    }

    const member = await prisma.householdMember.findFirst({
      where: { id: memberId, householdId: membership.householdId },
    });
    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    if (member.role === "owner") {
      return NextResponse.json({ error: "The household owner cannot be demoted" }, { status: 400 });
    }

    const updated = await prisma.householdMember.update({
      where: { id: member.id },
      data: { role },
      select: { id: true, email: true, role: true, createdAt: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/household/members", error);
    return NextResponse.json({ error: "Could not update household member" }, { status: 400 });
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const context = await requireHousehold();
  const denied = accessResponse(context);
  if (denied) return denied;
  const membership = context.membership;
  if (!membership) return NextResponse.json({ error: "Household membership required" }, { status: 403 });
  if (!canManageMembers(membership.role)) {
    return NextResponse.json({ error: "Admin permission required" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as { memberId?: unknown };
    const memberId = typeof body.memberId === "string" ? body.memberId : "";
    const member = await prisma.householdMember.findFirst({
      where: { id: memberId, householdId: membership.householdId },
    });
    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    if (member.role === "owner") {
      return NextResponse.json({ error: "The household owner cannot be removed" }, { status: 400 });
    }

    await prisma.householdMember.delete({ where: { id: member.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/household/members", error);
    return NextResponse.json({ error: "Could not remove household member" }, { status: 400 });
  }
}
