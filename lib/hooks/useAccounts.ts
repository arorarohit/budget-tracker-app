"use client";

/** Shared SWR hook for `/api/accounts` — see useCategories.ts for rationale. */
import useSWR from "swr";
import type { AccountDTO } from "@/lib/types";

const ACCOUNTS_KEY = "/api/accounts";

export function useAccounts() {
  const { data, error, isLoading, mutate } = useSWR<AccountDTO[]>(ACCOUNTS_KEY);

  return {
    accounts: data ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
    refresh: mutate,
  };
}
