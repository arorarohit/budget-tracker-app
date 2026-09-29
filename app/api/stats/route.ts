import { NextResponse } from "next/server";
import { requireHousehold, householdAccessError, withRlsUser } from "@/lib/auth/household";
import { computeStats, currentMonth } from "@/lib/stats";

export const dynamic = "force-dynamic";

/**
 * GET /api/stats — thin HTTP wrapper around the shared `computeStats`
 * aggregation (lib/stats.ts), which pushes all aggregation down to Postgres
 * instead of loading every matching transaction into Node memory and looping
 * in JS. `computeStats` is also called directly (no HTTP round trip) by the
 * Dashboard Server Component shell to prefetch data server-side.
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const context = await requireHousehold();
    if (!context.membership) {
      return NextResponse.json(householdAccessError(context.status), { status: context.status });
    }
    const householdId = context.membership.householdId;
    return await withRlsUser(context.userId, async (tx) => {
      const { searchParams } = new URL(req.url);
      const monthParam = searchParams.get("month");
      const month = monthParam && monthParam !== "" ? monthParam : currentMonth();

      const response = await computeStats(tx, householdId, month);
      if (!response) {
        return NextResponse.json({ error: "Invalid month" }, { status: 400 });
      }
      return NextResponse.json(response);
    });
  } catch (err) {
    console.error("GET /api/stats", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
