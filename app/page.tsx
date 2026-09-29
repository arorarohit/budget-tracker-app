/**
 * Dashboard page shell — a Server Component that prefetches the current
 * month's stats directly via `computeStats` (no HTTP round trip to its own
 * `/api/stats` endpoint) and hands them to the client island as SWR
 * `fallbackData`. This removes the client-side fetch-and-spinner that
 * previously ran on every single visit to "/", including the very first
 * load after sign-in — the biggest perceived-slowness contributor since the
 * Dashboard is the app's default landing route.
 *
 * All interactivity (month picker, retry, charts) lives in DashboardClient,
 * a client component, keeping this shell free of client-side JS.
 */
import { requireHousehold, withRlsUser } from "@/lib/auth/household";
import { computeStats, currentMonth } from "@/lib/stats";
import type { StatsResponse } from "@/lib/types";
import DashboardClient from "@/components/dashboard/DashboardClient";

export const dynamic = "force-dynamic";

async function fetchInitialStats(month: string): Promise<StatsResponse | null> {
  try {
    const context = await requireHousehold();
    if (!context.membership) return null;
    return await withRlsUser(context.userId, (tx) =>
      computeStats(tx, context.membership.householdId, month)
    );
  } catch (err) {
    console.error("Dashboard server prefetch failed", err);
    return null;
  }
}

export default async function DashboardPage() {
  const month = currentMonth();
  const initialStats = await fetchInitialStats(month);

  return <DashboardClient initialMonth={month} initialStats={initialStats} />;
}
