"use client";

import React, { useMemo, useState } from "react";
import { Button, Card, CardTitle, Select } from "@/components/ui";
import type { ColumnMapping } from "@/lib/types";

type AmountMode = "single" | "split";

const DATE_FORMATS: { value: ColumnMapping["dateFormat"]; label: string }[] = [
  { value: "dmy", label: "DD/MM/YYYY" },
  { value: "ymd", label: "YYYY-MM-DD" },
  { value: "mdy", label: "MM/DD/YYYY" },
];

/** Pick a sensible default column from the headers by keyword. */
function guess(headers: string[], keywords: string[]): string {
  const lower = headers.map((h) => h.toLowerCase());
  for (const kw of keywords) {
    const i = lower.findIndex((h) => h.includes(kw));
    if (i >= 0) return headers[i];
  }
  return headers[0] ?? "";
}

export default function ColumnMapperForm({
  headers,
  loading,
  onSubmit,
}: {
  headers: string[];
  loading: boolean;
  onSubmit: (mapping: ColumnMapping) => void;
}) {
  const [dateColumn, setDateColumn] = useState(() =>
    guess(headers, ["date"])
  );
  const [descriptionColumn, setDescriptionColumn] = useState(() =>
    guess(headers, ["description", "reference", "details", "merchant", "memo", "narrative"])
  );
  const [amountMode, setAmountMode] = useState<AmountMode>("single");
  const [amountColumn, setAmountColumn] = useState(() =>
    guess(headers, ["amount", "value"])
  );
  const [debitColumn, setDebitColumn] = useState(() =>
    guess(headers, ["paid out", "debit", "out", "withdraw"])
  );
  const [creditColumn, setCreditColumn] = useState(() =>
    guess(headers, ["paid in", "credit", "in", "deposit"])
  );
  const [dateFormat, setDateFormat] =
    useState<ColumnMapping["dateFormat"]>("dmy");
  const [invertAmount, setInvertAmount] = useState(false);

  const hasHeaders = headers.length > 0;

  const valid = useMemo(() => {
    if (!dateColumn || !descriptionColumn) return false;
    if (amountMode === "single") return Boolean(amountColumn);
    return Boolean(debitColumn) && Boolean(creditColumn);
  }, [
    dateColumn,
    descriptionColumn,
    amountMode,
    amountColumn,
    debitColumn,
    creditColumn,
  ]);

  function submit() {
    const mapping: ColumnMapping =
      amountMode === "single"
        ? {
            dateColumn,
            descriptionColumn,
            amountColumn,
            dateFormat,
            invertAmount,
          }
        : {
            dateColumn,
            descriptionColumn,
            debitColumn,
            creditColumn,
            dateFormat,
            invertAmount,
          };
    onSubmit(mapping);
  }

  function columnSelect(
    value: string,
    onChange: (v: string) => void
  ): React.ReactNode {
    return (
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {!hasHeaders && <option value="">No columns found</option>}
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </Select>
    );
  }

  return (
    <Card>
      <CardTitle>Map columns</CardTitle>
      <p className="mb-4 text-sm text-slate-400">
        We couldn&apos;t auto-detect this format. Tell us which columns to use.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-slate-400">Date column</label>
          {columnSelect(dateColumn, setDateColumn)}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-slate-400">Description column</label>
          {columnSelect(descriptionColumn, setDescriptionColumn)}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="text-xs text-slate-400">Amount columns</label>
          <div className="flex gap-2">
            <Button
              variant={amountMode === "single" ? "primary" : "secondary"}
              onClick={() => setAmountMode("single")}
              type="button"
            >
              Single signed column
            </Button>
            <Button
              variant={amountMode === "split" ? "primary" : "secondary"}
              onClick={() => setAmountMode("split")}
              type="button"
            >
              Separate paid-out / paid-in
            </Button>
          </div>
        </div>

        {amountMode === "single" ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-slate-400">Amount column</label>
            {columnSelect(amountColumn, setAmountColumn)}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-slate-400">
                Paid out (debit) column
              </label>
              {columnSelect(debitColumn, setDebitColumn)}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-slate-400">
                Paid in (credit) column
              </label>
              {columnSelect(creditColumn, setCreditColumn)}
            </div>
          </>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-slate-400">Date format</label>
          <Select
            value={dateFormat}
            onChange={(e) =>
              setDateFormat(e.target.value as ColumnMapping["dateFormat"])
            }
          >
            {DATE_FORMATS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        </div>

        <label className="flex items-center gap-2 self-end pb-1.5 text-sm text-slate-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-emerald-600"
            checked={invertAmount}
            onChange={(e) => setInvertAmount(e.target.checked)}
          />
          Amounts are positive for spending (credit card)
        </label>
      </div>

      <div className="mt-5 flex justify-end">
        <Button
          variant="primary"
          disabled={!valid || loading}
          onClick={submit}
        >
          {loading ? "Reading…" : "Preview import"}
        </Button>
      </div>
    </Card>
  );
}
