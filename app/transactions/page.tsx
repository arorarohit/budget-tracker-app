"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  PageHeader,
  Card,
  Button,
  Input,
  Select,
  Spinner,
  EmptyState,
} from "@/components/ui";
import MonthPicker from "@/components/MonthPicker";
import { currentMonth } from "@/lib/format";
import type {
  AccountDTO,
  CategoryDTO,
  TransactionListResponse,
  TxnDTO,
  UpdateTransactionRequest,
} from "@/lib/types";
import TransactionsTable from "@/components/transactions/TransactionsTable";
import RulePromptModal from "@/components/transactions/RulePromptModal";
import AddTransactionModal from "@/components/transactions/AddTransactionModal";

const PAGE_SIZE = 50;
/** Sentinel category-filter value for uncategorised transactions. */
const UNCATEGORIZED = "none";

/** Pending rule-prompt context after a manual categorisation. */
interface RulePrompt {
  txn: TxnDTO;
  categoryId: string;
  categoryName: string;
  suggestedPattern: string;
}

function TransactionsPageInner() {
  const searchParams = useSearchParams();

  // ---- Filter state ----
  const [allMonths, setAllMonths] = useState(false);
  const [month, setMonth] = useState<string>(currentMonth());
  const [categoryFilter, setCategoryFilter] = useState<string>(""); // "" all, "none" uncat, else id
  const [accountFilter, setAccountFilter] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState(""); // debounced
  const [offset, setOffset] = useState(0);

  // ---- Reference data ----
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [accounts, setAccounts] = useState<AccountDTO[]>([]);

  // ---- Transaction data ----
  const [transactions, setTransactions] = useState<TxnDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Mutation / modal state ----
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [rulePrompt, setRulePrompt] = useState<RulePrompt | null>(null);
  const [savingRule, setSavingRule] = useState(false);

  // Honour deep link /transactions?uncategorized=true once on mount.
  const appliedDeepLink = useRef(false);
  useEffect(() => {
    if (appliedDeepLink.current) return;
    appliedDeepLink.current = true;
    if (searchParams.get("uncategorized") === "true") {
      setCategoryFilter(UNCATEGORIZED);
    }
  }, [searchParams]);

  // Debounce the search input (300ms) → query; reset to first page.
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(searchInput.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Reset to first page whenever a filter changes.
  useEffect(() => {
    setOffset(0);
  }, [allMonths, month, categoryFilter, accountFilter]);

  // Load reference data once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [catRes, accRes] = await Promise.all([
          fetch("/api/categories"),
          fetch("/api/accounts"),
        ]);
        const cats = (await catRes.json()) as CategoryDTO[];
        const accs = (await accRes.json()) as AccountDTO[];
        if (cancelled) return;
        setCategories(Array.isArray(cats) ? cats : []);
        setAccounts(Array.isArray(accs) ? accs : []);
      } catch {
        // Non-fatal: filters just show fewer options.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (!allMonths) params.set("month", month);
    if (categoryFilter) params.set("categoryId", categoryFilter);
    if (accountFilter) params.set("accountId", accountFilter);
    if (query) params.set("q", query);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    return params.toString();
  }, [allMonths, month, categoryFilter, accountFilter, query, offset]);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/transactions?${buildQuery()}`);
      if (!res.ok) throw new Error("Failed to load transactions");
      const data = (await res.json()) as TransactionListResponse;
      setTransactions(data.transactions);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load transactions");
      setTransactions([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Refetch reference data (used after mutations that change counts/options).
  const refetchAll = useCallback(async () => {
    await fetchTransactions();
  }, [fetchTransactions]);

  // ---- Category change → PATCH → maybe rule prompt ----
  async function patchCategory(
    txn: TxnDTO,
    body: UpdateTransactionRequest
  ): Promise<boolean> {
    setBusyId(txn.id);
    try {
      const res = await fetch(`/api/transactions/${txn.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update category");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update category");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function handleCategoryChange(txn: TxnDTO, categoryId: string | null) {
    const ok = await patchCategory(txn, { categoryId });
    if (!ok) return;

    // Offer to create a rule only when a real category was chosen and the row
    // was previously auto/un-categorised (never override an explicit "manual").
    const wasAuto =
      txn.categorySource === "none" || txn.categorySource === "builtin";
    if (categoryId && wasAuto) {
      const cat = categories.find((c) => c.id === categoryId);
      const base = (txn.merchant ?? txn.description).toUpperCase().trim();
      setRulePrompt({
        txn,
        categoryId,
        categoryName: cat ? cat.name : "this category",
        suggestedPattern: base,
      });
    }

    await refetchAll();
  }

  async function handleSaveRule(pattern: string, applyToExisting: boolean) {
    if (!rulePrompt) return;
    setSavingRule(true);
    const ok = await patchCategory(rulePrompt.txn, {
      categoryId: rulePrompt.categoryId,
      createRule: { pattern, applyToExisting },
    });
    setSavingRule(false);
    if (ok) {
      setRulePrompt(null);
      await refetchAll();
    }
  }

  async function handleDelete(txn: TxnDTO) {
    try {
      const res = await fetch(`/api/transactions/${txn.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete transaction");
      await refetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete transaction");
    }
  }

  // ---- Derived UI ----
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + transactions.length, total);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle={loading ? undefined : `${total.toLocaleString("en-GB")} transactions`}
        actions={
          <Button variant="primary" onClick={() => setShowAdd(true)}>
            + Add transaction
          </Button>
        }
      />

      {/* Filters toolbar */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <MonthPicker month={month} onChange={setMonth} />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={allMonths}
              onChange={(e) => setAllMonths(e.target.checked)}
              className="h-4 w-4 accent-emerald-600"
            />
            All months
          </label>

          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            <option value={UNCATEGORIZED}>❓ Uncategorised</option>
            {sortedCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </Select>

          <Select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            aria-label="Filter by account"
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>

          <Input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search description, merchant, notes…"
            className="min-w-[14rem] flex-1"
            aria-label="Search transactions"
          />
        </div>
      </Card>

      {/* Results */}
      <Card>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
            <Spinner />
            <span className="text-sm">Loading transactions…</span>
          </div>
        ) : error ? (
          <EmptyState
            icon="⚠️"
            title="Couldn't load transactions"
            hint={error}
            action={
              <Button variant="secondary" onClick={fetchTransactions}>
                Retry
              </Button>
            }
          />
        ) : transactions.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="No transactions found"
            hint={
              query || categoryFilter || accountFilter || !allMonths
                ? "Try widening your filters, or add a transaction manually."
                : "Import a bank statement or add a transaction to get started."
            }
            action={
              <Button variant="primary" onClick={() => setShowAdd(true)}>
                + Add transaction
              </Button>
            }
          />
        ) : (
          <>
            <TransactionsTable
              transactions={transactions}
              categories={sortedCategories}
              busyId={busyId}
              onCategoryChange={handleCategoryChange}
              onDelete={handleDelete}
            />

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
              <span>
                Showing {rangeStart}–{rangeEnd} of{" "}
                {total.toLocaleString("en-GB")}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  Page {page} of {pageCount}
                </span>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setOffset((o) => Math.max(0, o - PAGE_SIZE))
                  }
                  disabled={offset === 0}
                >
                  ‹ Prev
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                  disabled={offset + PAGE_SIZE >= total}
                >
                  Next ›
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Add transaction modal */}
      {showAdd && (
        <AddTransactionModal
          categories={sortedCategories}
          accounts={accounts}
          defaultAccountId={accountFilter || undefined}
          onClose={() => setShowAdd(false)}
          onCreated={async () => {
            setShowAdd(false);
            await refetchAll();
          }}
        />
      )}

      {/* Rule prompt modal */}
      {rulePrompt && (
        <RulePromptModal
          suggestedPattern={rulePrompt.suggestedPattern}
          categoryName={rulePrompt.categoryName}
          saving={savingRule}
          onSave={handleSaveRule}
          onDismiss={() => setRulePrompt(null)}
        />
      )}
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Spinner />
          <span className="text-sm">Loading…</span>
        </div>
      }
    >
      <TransactionsPageInner />
    </Suspense>
  );
}
