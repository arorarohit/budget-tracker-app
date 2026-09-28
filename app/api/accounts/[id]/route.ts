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
    const householdId = context.membership.householdId;
    return await withRlsUser(context.userId, async (tx) => {
      const existing = await tx.account.findFirst({
        where: { id: params.id, householdId },
        select: { id: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Account not found" }, { status: 404 });
      }
      // FK SetNull leaves the account's transactions with accountId = null.
      await tx.account.delete({ where: { id: params.id } });
      return NextResponse.json({ ok: true });
    });
  } catch (err) {
    console.error("DELETE /api/accounts/[id]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
