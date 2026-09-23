"use client";

import React, { useCallback, useEffect, useState } from "react";
import { PageHeader, Spinner } from "@/components/ui";
import type { CategoryDTO } from "@/lib/types";
import CategoryManager from "@/components/categories/CategoryManager";
import RulesManager from "@/components/categories/RulesManager";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/categories");
      if (!res.ok) throw new Error("Failed to load categories");
      const data: CategoryDTO[] = await res.json();
      setCategories(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

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
          <CategoryManager categories={categories} onChanged={loadCategories} />
          <RulesManager categories={categories} />
        </div>
      )}
    </div>
  );
}
