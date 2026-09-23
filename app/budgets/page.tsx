"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  CardTitle,
  EmptyState,
  PageHeader,
  Spinner,
} from "@/components/ui";
import { currentMonth, formatMonth, formatPenceAbs } from "@/lib/format";
import type {
  BudgetDTO,
  CategoryDTO,
  SetBudgetsRequest,
  StatsResponse,
} from "@/lib/types";
import BudgetEditor, { poundsToPence } from "@/components/budgets/BudgetEditor";

/** Map a CategoryDTO.budgetPence to the controlled pounds input string. */
function penceToPounds(budgetPence: number | null): string {
  if (budgetPence === null) return "";
  return String(budgetPence / 100);
}

export default function BudgetsPage() {
  const month = useMemo(() => currentMonth(), []);

  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catRes, statsRes] = await Promise.all([
        fetch("/api/categories"),
        fetch(`/api/stats?month=${month}`),
      ]);
      if (!catRes.ok) throw new Error("Failed to load categories");
      if (!statsRes.ok) throw new Error("Failed to load stats");
      const cats: CategoryDTO[] = await catRes.json();
      const s: StatsResponse = await statsRes.json();
      setCategories(cats);
      setStats(s);
      const nextDrafts: Record<string, string> = {};
      for (const c of cats) {
        nextDrafts[c.id] = penceToPounds(c.budgetPence);
      }
      setDrafts(nextDrafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load budgets");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  // Only expense categories get budgets; income/transfer are skipped.
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === "expense"),
    [categories],
  );

  // categoryId -> spent this month (positive pence), 0 default.
  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    if (stats) {
      for (const c of stats.byCategory) {
        if (c.categoryId) map.set(c.categoryId, c.spendPence);
      }
    }
    return map;
  }, [stats]);

  // Summary totals from the current draft state.
  const summary = useMemo(() => {
    let totalBudgeted = 0;
    let totalSpent = 0;
    for (const c of expenseCategories) {
      const budget = poundsToPence(drafts[c.id] ?? "");
      if (budget !== null) totalBudgeted += budget;
      totalSpent += spentByCategory.get(c.id) ?? 0;
    }
    return {
      totalBudgeted,
      totalSpent,
      remaining: totalBudgeted - totalSpent,
    };
  }, [expenseCategories, drafts, spentByCategory]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setFlash(false);
    try {
      const body: SetBudgetsRequest = {
        budgets: expenseCategories.map((c) => ({
          categoryId: c.id,
          amountPence: poundsToPence(drafts[c.id] ?? ""),
        })),
      };
      const res = await fetch("/api/budgets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save budgets");
      }
      // Response is BudgetDTO[]; refetch everything to stay consistent.
      (await res.json()) as BudgetDTO[];
      setFlash(true);
      window.setTimeout(() => setFlash(false), 2500);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save budgets");
    } finally {
      setSaving(false);
    }
  }, [expenseCategories, drafts, load]);

  return (
    <div>
      <PageHeader
        title="Budgets"
        subtitle={`Monthly targets · ${formatMonth(month)}`}
        actions={
          <Button variant="primary" onClick={handleSave} disabled={saving || loading}>
            {saving ? <Spinner /> : null}
            Save budgets
          </Button>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
      {flash && (
        <div className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-2 text-sm text-emerald-300">
          Budgets saved.
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardTitle>This month</CardTitle>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  Budgeted
                </div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-slate-100">
                  {formatPenceAbs(summary.totalBudgeted)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  Spent
                </div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-slate-100">
                  {formatPenceAbs(summary.totalSpent)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  Remaining
                </div>
                <div
                  className={`mt-1 text-xl font-semibold tabular-nums ${
                    summary.remaining < 0 ? "text-red-400" : "text-emerald-400"
                  }`}
                >
                  {formatPenceAbs(summary.remaining)}
                </div>
              </div>
            </div>
            <p className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-500">
              Budgets are monthly and apply to every month.
            </p>
          </Card>

          <Card>
            <CardTitle>Category budgets</CardTitle>
            {expenseCategories.length === 0 ? (
              <EmptyState
                icon="🎯"
                title="No expense categories"
                hint="Create expense categories on the Categories page to set budgets."
              />
            ) : (
              <div className="divide-y divide-slate-800">
                <div className="grid grid-cols-[minmax(0,1fr)_8rem_10rem] gap-4 pb-2 text-xs uppercase tracking-wider text-slate-500">
                  <div>Category</div>
                  <div className="text-right">Spent</div>
                  <div className="text-right">Monthly budget</div>
                </div>
                {expenseCategories.map((c) => (
                  <BudgetEditor
                    key={c.id}
                    category={c}
                    spentPence={spentByCategory.get(c.id) ?? 0}
                    value={drafts[c.id] ?? ""}
                    onChange={(v) =>
                      setDrafts((prev) => ({ ...prev, [c.id]: v }))
                    }
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
