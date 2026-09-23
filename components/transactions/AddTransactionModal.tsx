"use client";

import React, { useEffect, useState } from "react";
import { Card, CardTitle, Button, Input, Select } from "@/components/ui";
import type {
  AccountDTO,
  CategoryDTO,
  CreateTransactionRequest,
  TxnDTO,
} from "@/lib/types";

/** Today as ISO yyyy-MM-dd (local). */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;
}

/** "12.34" pounds → 1234 pence; tolerant of stray £/commas/spaces. */
function poundsToPence(raw: string): number {
  const cleaned = raw.replace(/[£,\s]/g, "");
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return NaN;
  return Math.round(value * 100);
}

type Direction = "out" | "in";

/**
 * Modal form to manually add a transaction. Amount is entered as a positive
 * pounds value plus a direction; we sign it into pence ("Money out" negative).
 * POSTs to /api/transactions and, on success, hands the created row to onCreated
 * so the parent can close + refetch.
 */
export default function AddTransactionModal({
  categories,
  accounts,
  /** Pre-select this account (e.g. the current filter), optional */
  defaultAccountId,
  onClose,
  onCreated,
}: {
  categories: CategoryDTO[];
  accounts: AccountDTO[];
  defaultAccountId?: string;
  onClose: () => void;
  onCreated: (txn: TxnDTO) => void;
}) {
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<Direction>("out");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState(defaultAccountId ?? "");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pence = poundsToPence(amount);
  const amountValid = Number.isFinite(pence) && pence > 0;
  const canSubmit = description.trim().length > 0 && amountValid && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const signedPence = direction === "out" ? -Math.abs(pence) : Math.abs(pence);
    const body: CreateTransactionRequest = {
      date,
      description: description.trim(),
      amountPence: signedPence,
    };
    if (categoryId) body.categoryId = categoryId;
    if (accountId) body.accountId = accountId;
    const trimmedNotes = notes.trim();
    if (trimmedNotes) body.notes = trimmedNotes;

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Failed to add transaction");
      }
      const created = (await res.json()) as TxnDTO;
      onCreated(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add transaction");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <Card className="w-full max-w-md">
        <div onClick={(e) => e.stopPropagation()}>
          <CardTitle>Add transaction</CardTitle>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Date
              </label>
              <Input
                type="date"
                value={date}
                max={today()}
                onChange={(e) => setDate(e.target.value)}
                className="w-full"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Description
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Tesco Express"
                className="w-full"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Amount (£)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full"
                />
              </div>
              <div className="w-36">
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Direction
                </label>
                <Select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as Direction)}
                  className="w-full"
                >
                  <option value="out">Money out</option>
                  <option value="in">Money in</option>
                </Select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Category (optional)
              </label>
              <Select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full"
              >
                <option value="">Uncategorised</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Account (optional)
              </label>
              <Select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full"
              >
                <option value="">No account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Notes (optional)
              </label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add a note"
                className="w-full"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {submitting ? "Adding…" : "Add transaction"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
