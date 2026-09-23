"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  CardTitle,
  CategoryBadge,
  EmptyState,
  Input,
  Select,
  Spinner,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import type { CategoryDTO, CreateRuleRequest, RuleDTO } from "@/lib/types";

export default function RulesManager({
  categories,
}: {
  categories: CategoryDTO[];
}) {
  const [rules, setRules] = useState<RuleDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Add-rule form state.
  const [pattern, setPattern] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [applyToExisting, setApplyToExisting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const res = await fetch("/api/rules");
      if (!res.ok) throw new Error("Failed to load rules");
      const data: RuleDTO[] = await res.json();
      setRules(data);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Default the category select to the first category once loaded.
  useEffect(() => {
    if (categoryId === "" && categories.length > 0) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      setListError(null);
      try {
        const res = await fetch(`/api/rules/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const data: { error?: string } = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to delete rule");
        }
        await load();
      } catch (e) {
        setListError(e instanceof Error ? e.message : "Failed to delete rule");
      } finally {
        setDeletingId(null);
      }
    },
    [load],
  );

  const handleAdd = useCallback(async () => {
    if (pattern.trim() === "") {
      setAddError("Pattern is required");
      return;
    }
    if (categoryId === "") {
      setAddError("Choose a category");
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const body: CreateRuleRequest = {
        pattern: pattern.trim().toUpperCase(),
        categoryId,
        applyToExisting,
      };
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add rule");
      }
      setPattern("");
      setApplyToExisting(false);
      await load();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to add rule");
    } finally {
      setAdding(false);
    }
  }, [pattern, categoryId, applyToExisting, load]);

  return (
    <Card>
      <CardTitle>Rules</CardTitle>
      <p className="-mt-2 mb-4 text-sm text-slate-400">
        Rules auto-categorise imported transactions by matching text. Your rules
        always beat the built-in UK merchant list.
      </p>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          icon="⚙️"
          title="No rules yet"
          hint="Add a rule below to automatically categorise matching transactions."
        />
      ) : (
        <ul className="divide-y divide-slate-800">
          {rules.map((r) => {
            const busy = deletingId === r.id;
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-3 py-2.5"
              >
                <code className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-200">
                  {r.pattern}
                </code>
                <span className="text-slate-600">→</span>
                <CategoryBadge
                  name={r.category.name}
                  color={r.category.color}
                  icon={r.category.icon}
                />
                <span className="ml-auto text-xs text-slate-500">
                  {formatDate(r.createdAt)}
                </span>
                <Button
                  variant="ghost"
                  disabled={busy}
                  aria-label={`Delete rule ${r.pattern}`}
                  onClick={() => handleDelete(r.id)}
                >
                  {busy ? <Spinner /> : "✕"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {listError && (
        <div className="mt-2 text-xs text-red-400">{listError}</div>
      )}

      {/* Add-rule form */}
      <div className="mt-5 border-t border-slate-800 pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            className="min-w-48 flex-1 font-mono"
            placeholder="PATTERN (e.g. TESCO)"
            value={pattern}
            aria-label="Rule pattern"
            onChange={(e) => setPattern(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAdd();
            }}
          />
          <Select
            value={categoryId}
            aria-label="Rule category"
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {categories.length === 0 && <option value="">No categories</option>}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </Select>
          <Button
            variant="primary"
            disabled={adding || categories.length === 0}
            onClick={handleAdd}
          >
            {adding ? <Spinner /> : null}
            Add rule
          </Button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-400">
          <input
            type="checkbox"
            checked={applyToExisting}
            onChange={(e) => setApplyToExisting(e.target.checked)}
            className="h-4 w-4 rounded border-slate-700 bg-slate-900 accent-emerald-600"
          />
          Apply to existing uncategorised transactions
        </label>
        {addError && <div className="mt-2 text-xs text-red-400">{addError}</div>}
      </div>
    </Card>
  );
}
