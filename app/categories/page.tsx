"use client";

import { useCallback } from "react";
import { PageHeader, Spinner } from "@/components/ui";
import { useCategories } from "@/lib/hooks/useCategories";
import CategoryManager from "@/components/categories/CategoryManager";
import RulesManager from "@/components/categories/RulesManager";

export default function CategoriesPage() {
  // Shared SWR cache: if the Budgets or Transactions page already fetched
  // categories recently, this renders instantly from cache instead of
  // re-fetching and showing a spinner on every navigation to this page.
  const { categories, isLoading, error, refresh } = useCategories();
  const loading = isLoading && categories.length === 0;
  // CategoryManager's onChanged expects () => void | Promise<void>; SWR's
  // mutate() resolves with the revalidated data, which isn't assignable to
  // that signature, so wrap it to discard the return value.
  const handleChanged = useCallback(async () => {
    await refresh();
  }, [refresh]);

  return (
    <div>
      <PageHeader
        title="Categories & Rules"
        subtitle="Organise your spending and automate categorisation of imports."
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6">
          <CategoryManager categories={categories} onChanged={handleChanged} />
          <RulesManager categories={categories} />
        </div>
      )}
    </div>
  );
}
