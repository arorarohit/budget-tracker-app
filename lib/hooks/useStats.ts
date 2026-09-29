"use client";

/**
 * Shared SWR hook for `/api/stats?month=...`. Keyed by month so the
 * Dashboard and Budgets pages — which both need stats for the current month
 * — share one cached response instead of firing two independent requests.
 *
 * Accepts optional `fallbackData` — when the Dashboard's Server Component
 * shell has already fetched the current month's stats at render time (no
 * client round trip needed), passing it here means SWR renders that data on
 * the very first paint with no loading spinner, then silently revalidates.
 */
import useSWR from "swr";
import type { StatsResponse } from "@/lib/types";

export function statsKey(month: string): string {
  return `/api/stats?month=${encodeURIComponent(month)}`;
}

export function useStats(month: string, fallbackData?: StatsResponse) {
  const { data, error, isLoading, mutate } = useSWR<StatsResponse>(
    statsKey(month),
    { fallbackData }
  );

  return {
    stats: data ?? null,
    isLoading,
    error: error instanceof Error ? error.message : null,
    refresh: mutate,
  };
}
