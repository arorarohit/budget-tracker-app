import { prisma } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/supabase/server";

export type HouseholdRole = "owner" | "admin" | "member";

export async function requireHousehold() {
  const { user } = await requireAuthenticatedUser();
  if (!user) {
    return { user: null, membership: null, status: 401 as const };
  }

  const membership = await prisma.householdMember.findFirst({
    where: { userId: user.id },
  });

  if (!membership) {
    return { user, membership: null, status: 403 as const };
  }

  return { user, membership, status: 200 as const };
}

export function canManageMembers(role: string): boolean {
  return role === "owner" || role === "admin";
}
