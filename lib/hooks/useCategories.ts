"use client";

/**
 * Shared SWR hook for `/api/categories`. Any component that calls this hook
 * reads from (and revalidates) the SAME cache entry, so navigating between
 * Categories, Budgets, and Transactions no longer re-fetches and re-renders
 * a loading spinner for data that was just fetched moments ago on another
 * page — the cached value renders immediately while SWR revalidates quietly
 * in the background.
 */
import useSWR from "swr";
import type { CategoryDTO } from "@/lib/types";

const CATEGORIES_KEY = "/api/categories";

export function useCategories() {
  const { data, error, isLoading, mutate } = useSWR<CategoryDTO[]>(CATEGORIES_KEY);

  return {
    categories: data ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
    /** Call after any mutation (create/update/delete) to refresh the shared cache. */
    refresh: mutate,
  };
}
