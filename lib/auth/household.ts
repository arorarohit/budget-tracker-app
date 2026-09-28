import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/supabase/server";

export type HouseholdRole = "owner" | "admin" | "member";

export function householdAccessError(status: 401 | 403) {
  return {
    error:
      status === 401
        ? "Authentication required"
        : "Household membership required",
  };
}

export async function requireHousehold() {
  const { user } = await requireAuthenticatedUser();
  if (!user) {
    return { user: null, membership: null, status: 401 as const };
  }

  const membership = await withRlsUser(user.id, (tx) =>
    tx.householdMember.findFirst({ where: { userId: user.id } })
  );

  if (!membership) {
    return { user, membership: null, status: 403 as const };
  }

  return { user, userId: user.id, membership, status: 200 as const };
}

export async function withRlsUser<T>(
  userId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL ROLE authenticated`;
    await tx.$executeRaw`SELECT set_config('request.jwt.claim.sub', ${userId}, true)`;
    await tx.$executeRaw`SELECT set_config('request.jwt.claims', ${JSON.stringify(
      { sub: userId, role: "authenticated" }
    )}, true)`;
    return operation(tx);
  });
}

export function canManageMembers(role: string): boolean {
  return role === "owner" || role === "admin";
}
