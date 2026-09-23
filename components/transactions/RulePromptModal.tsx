"use client";

import React, { useEffect, useState } from "react";
import { Card, CardTitle, Button, Input } from "@/components/ui";

/**
 * Prompts the user — after they manually categorise a previously-uncategorised
 * (or builtin) transaction — to persist a rule so similar transactions get the
 * same category automatically.
 *
 * "Save rule" calls onSave with the (possibly edited) pattern and the
 * applyToExisting flag; the parent re-PATCHes the transaction with createRule.
 * "Just this one" simply dismisses.
 */
export default function RulePromptModal({
  /** Suggested pattern, e.g. (merchant || description).toUpperCase().trim() */
  suggestedPattern,
  /** Name of the category that was just assigned, for the prompt copy */
  categoryName,
  saving = false,
  onSave,
  onDismiss,
}: {
  suggestedPattern: string;
  categoryName: string;
  saving?: boolean;
  onSave: (pattern: string, applyToExisting: boolean) => void;
  onDismiss: () => void;
}) {
  const [pattern, setPattern] = useState(suggestedPattern);
  const [applyToExisting, setApplyToExisting] = useState(true);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const trimmed = pattern.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onDismiss}
    >
      <Card
        className="w-full max-w-md"
        // stop propagation so clicks inside the card don't dismiss
      >
        <div onClick={(e) => e.stopPropagation()}>
          <CardTitle>Always categorise transactions like this?</CardTitle>
          <p className="mb-4 text-sm text-slate-400">
            Future transactions whose description contains this text will be
            categorised as{" "}
            <span className="font-medium text-slate-200">{categoryName}</span>.
          </p>

          <label className="mb-1 block text-xs font-medium text-slate-400">
            Match pattern (uppercase substring)
          </label>
          <Input
            value={pattern}
            onChange={(e) => setPattern(e.target.value.toUpperCase())}
            className="mb-4 w-full font-mono"
            autoFocus
          />

          <label className="mb-5 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={applyToExisting}
              onChange={(e) => setApplyToExisting(e.target.checked)}
              className="h-4 w-4 accent-emerald-600"
            />
            Also apply to existing uncategorised transactions
          </label>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onDismiss} disabled={saving}>
              Just this one
            </Button>
            <Button
              variant="primary"
              onClick={() => onSave(trimmed, applyToExisting)}
              disabled={saving || trimmed.length === 0}
            >
              {saving ? "Saving…" : "Save rule"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
