"use client";

/**
 * Global SWR configuration provider. Wraps the app so every `useSWR` call
 * shares a single in-memory cache keyed by request URL — this is what lets
 * Categories, Budgets, and Transactions pages reuse the SAME `/api/categories`
 * response instead of each page independently re-fetching it from scratch on
 * every navigation (previously: 3 separate fetches + 3 loading spinners for
 * identical data).
 *
 * `dedupingInterval` collapses duplicate requests fired in quick succession
 * (e.g. two components mounting on the same page both asking for categories).
 * `revalidateOnFocus` is left on so data still refreshes if the user tabs
 * back after making changes elsewhere, but cached data renders INSTANTLY
 * first (stale-while-revalidate) instead of showing a spinner.
 */
import { SWRConfig } from "swr";

async function defaultFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body && body.error) || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: defaultFetcher,
        dedupingInterval: 5000,
        revalidateOnFocus: true,
        revalidateIfStale: true,
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
