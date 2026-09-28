import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireHousehold, householdAccessError, withRlsUser } from "@/lib/auth/household";

export const dynamic = "force-dynamic";

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
    const existing = await tx.categoryRule.findFirst({
      where: { id: params.id, householdId: context.membership.householdId },
    });
    if (!existing || existing.householdId !== context.membership.householdId) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }
    await tx.categoryRule.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
    });
  } catch (err) {
    console.error("DELETE /api/rules/[id]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
