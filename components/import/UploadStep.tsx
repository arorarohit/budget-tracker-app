"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button, Card, CardTitle, Input, Select } from "@/components/ui";
import type { AccountDTO, ColumnMapping } from "@/lib/types";
import ColumnMapperForm from "@/components/import/ColumnMapperForm";

/** Bank preset ids — MUST match the parser preset ids exactly. */
const BANK_OPTIONS: { id: string; label: string }[] = [
  { id: "", label: "Auto-detect" },
  { id: "chase", label: "Chase UK (PDF / CSV)" },
  { id: "amex", label: "American Express (PDF / CSV)" },
  { id: "monzo", label: "Monzo" },
  { id: "starling", label: "Starling Bank" },
  { id: "barclays", label: "Barclays" },
  { id: "hsbc", label: "HSBC" },
  { id: "lloyds", label: "Lloyds / Halifax / Bank of Scotland / TSB" },
  { id: "natwest", label: "NatWest / RBS" },
  { id: "nationwide", label: "Nationwide" },
  { id: "revolut", label: "Revolut" },
  { id: "generic", label: "Other bank (map columns manually)" },
];

const ACCOUNT_TYPES: { value: string; label: string }[] = [
  { value: "current", label: "Current" },
  { value: "savings", label: "Savings" },
  { value: "credit_card", label: "Credit card" },
];

/** Rough row-count estimate: non-empty lines minus one (assumed header). */
function estimateRows(text: string): number {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  return Math.max(0, lines.length - 1);
}

export interface UploadSubmit {
  csvText?: string;
  file?: File;
  accountName: string;
  accountType: string;
  presetId: string;
  mapping?: ColumnMapping;
}

export default function UploadStep({
  onSubmit,
  loading,
  error,
  /** Populated when the server returned presetId "unknown" or the user chose generic. */
  mappingHeaders,
}: {
  onSubmit: (data: UploadSubmit) => void;
  loading: boolean;
  error: string | null;
  mappingHeaders: string[] | null;
}) {
  const [accounts, setAccounts] = useState<AccountDTO[]>([]);
  const [csvText, setCsvText] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState("current");
  const [presetId, setPresetId] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AccountDTO[]) => {
        if (active) setAccounts(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        /* non-fatal: datalist is just a convenience */
      });
    return () => {
      active = false;
    };
  }, []);

  const rowEstimate = csvText ? estimateRows(csvText) : (uploadedFile ? 1 : 0);
  const canContinue =
    (csvText.trim().length > 0 || uploadedFile !== null) && accountName.trim().length > 0 && !loading;

  function readFile(file: File) {
    setFileError(null);
    setUploadedFile(file);
    setFileName(file.name);

    if (/\.pdf$/i.test(file.name)) {
      setCsvText("");
      if (/chase/i.test(file.name)) setPresetId("chase");
      if (/amex|american/i.test(file.name)) {
        setPresetId("amex");
        setAccountType("credit_card");
      }
      return;
    }

    if (!/\.csv$/i.test(file.name)) {
      setFileError("Please choose a .csv or .pdf file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => setFileError("Could not read that file.");
    reader.readAsText(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  }

  function submit(mapping?: ColumnMapping) {
    onSubmit({
      csvText,
      file: uploadedFile || undefined,
      accountName: accountName.trim(),
      accountType,
      presetId,
      mapping,
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardTitle>Choose a statement file</CardTitle>
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragOver
              ? "border-emerald-500 bg-emerald-950/20"
              : "border-slate-700 hover:border-slate-600"
          }`}
        >
          <div className="text-3xl">{fileName.endsWith('.pdf') ? "📕" : "📄"}</div>
          <div className="text-sm font-medium text-slate-200">
            {fileName ? fileName : "Drag a statement PDF or CSV here, or click to browse"}
          </div>
          {fileName ? (
            <div className="text-xs text-slate-400">
              {fileName.endsWith('.pdf') ? "PDF bank statement loaded" : `~${rowEstimate} row${rowEstimate === 1 ? "" : "s"}`}
            </div>
          ) : (
            <div className="text-xs text-slate-400">Supports PDF statements (Chase, Amex) and CSV exports</div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv,application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) readFile(file);
            }}
          />
        </div>
        {fileError && (
          <p className="mt-2 text-sm text-red-400">{fileError}</p>
        )}
      </Card>

      <Card>
        <CardTitle>Account</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-slate-400">Account name</label>
            <Input
              list="account-names"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g. Monzo Current"
            />
            <datalist id="account-names">
              {accounts.map((a) => (
                <option key={a.id} value={a.name} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-slate-400">Account type</label>
            <Select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className="text-xs text-slate-400">Bank</label>
            <Select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
            >
              {BANK_OPTIONS.map((b) => (
                <option key={b.id || "auto"} value={b.id}>
                  {b.id === "" ? "Auto-detect" : b.label}
                </option>
              ))}
            </Select>
            <p className="text-xs text-slate-500">
              Santander? Its export isn&apos;t standard CSV — choose
              &quot;Other bank&quot; and map the columns.
            </p>
          </div>
        </div>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {mappingHeaders !== null ? (
        <ColumnMapperForm
          headers={mappingHeaders}
          loading={loading}
          onSubmit={(mapping) => submit(mapping)}
        />
      ) : (
        <div className="flex justify-end">
          <Button
            variant="primary"
            disabled={!canContinue}
            onClick={() => submit()}
          >
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}
