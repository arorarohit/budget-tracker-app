"use client";

import React, { useState } from "react";
import { PageHeader } from "@/components/ui";
import UploadStep, {
  type UploadSubmit,
} from "@/components/import/UploadStep";
import PreviewTable from "@/components/import/PreviewTable";
import ResultStep from "@/components/import/ResultStep";
import type {
  CommitRequest,
  CommitResponse,
  PreviewRequest,
  PreviewResponse,
} from "@/lib/types";

type Step = 1 | 2 | 3;

const STEP_LABELS: Record<Step, string> = {
  1: "Upload",
  2: "Preview",
  3: "Done",
};

/** Pull an { error } message out of a non-OK response, with a fallback. */
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === "string") return body.error;
  } catch {
    /* ignore */
  }
  return fallback;
}

function StepIndicator({ step }: { step: Step }) {
  const steps: Step[] = [1, 2, 3];
  return (
    <div className="mb-8 flex items-center gap-2 text-sm">
      {steps.map((s, i) => {
        const active = s === step;
        const done = s < step;
        return (
          <React.Fragment key={s}>
            <div className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  active
                    ? "bg-emerald-600 text-white"
                    : done
                      ? "bg-emerald-900/60 text-emerald-300"
                      : "bg-slate-800 text-slate-500"
                }`}
              >
                {done ? "✓" : s}
              </span>
              <span
                className={
                  active
                    ? "font-medium text-slate-200"
                    : "text-slate-500"
                }
              >
                {STEP_LABELS[s]}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span className="h-px w-8 bg-slate-800" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function ImportPage() {
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // null = no mapper shown; string[] = show mapper seeded with these headers.
  const [mappingHeaders, setMappingHeaders] = useState<string[] | null>(null);

  // Step 2 state
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [commitLoading, setCommitLoading] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Step 3 state
  const [result, setResult] = useState<CommitResponse | null>(null);

  async function runPreview(data: UploadSubmit) {
    setUploadLoading(true);
    setUploadError(null);

    try {
      let res: Response;
      if (data.file) {
        const formData = new FormData();
        formData.append("file", data.file);
        formData.append("accountName", data.accountName);
        formData.append("accountType", data.accountType);
        if (data.presetId) formData.append("presetId", data.presetId);
        res = await fetch("/api/import/preview", {
          method: "POST",
          body: formData,
        });
      } else {
        const body: PreviewRequest = {
          csvText: data.csvText || "",
          accountName: data.accountName,
          accountType: data.accountType,
        };
        // Omit presetId when auto-detecting ("").
        if (data.presetId) body.presetId = data.presetId;
        if (data.mapping) body.mapping = data.mapping;

        res = await fetch("/api/import/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      if (!res.ok) {
        setUploadError(await readError(res, "Could not read that file."));
        return;
      }
      const json: PreviewResponse = await res.json();

      // Show the inline mapper when the server couldn't detect a format, or
      // when the user explicitly chose "generic" but hasn't mapped yet.
      const needsMapping =
        json.presetId === "unknown" ||
        (data.presetId === "generic" && !data.mapping);

      if (needsMapping) {
        setMappingHeaders(json.headers ?? []);
        return;
      }

      setMappingHeaders(null);
      setPreview(json);
      setCommitError(null);
      setStep(2);
    } catch {
      setUploadError("Something went wrong reading the file.");
    } finally {
      setUploadLoading(false);
    }
  }

  async function runCommit(rows: CommitRequest["rows"]) {
    if (!preview) return;
    setCommitLoading(true);
    setCommitError(null);

    const body: CommitRequest = {
      accountId: preview.accountId,
      source: preview.presetName,
      rows,
    };

    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setCommitError(await readError(res, "Import failed."));
        return;
      }
      const json: CommitResponse = await res.json();
      setResult(json);
      setStep(3);
    } catch {
      setCommitError("Something went wrong during import.");
    } finally {
      setCommitLoading(false);
    }
  }

  function reset() {
    setStep(1);
    setUploadLoading(false);
    setUploadError(null);
    setMappingHeaders(null);
    setPreview(null);
    setCommitLoading(false);
    setCommitError(null);
    setResult(null);
  }

  return (
    <div>
      <PageHeader
        title="Import transactions"
        subtitle="Upload a bank statement CSV, review, and import."
      />
      <StepIndicator step={step} />

      {step === 1 && (
        <UploadStep
          onSubmit={runPreview}
          loading={uploadLoading}
          error={uploadError}
          mappingHeaders={mappingHeaders}
        />
      )}

      {step === 2 && preview && (
        <PreviewTable
          preview={preview}
          loading={commitLoading}
          error={commitError}
          onBack={() => {
            setStep(1);
            setCommitError(null);
          }}
          onCommit={runCommit}
        />
      )}

      {step === 3 && result && (
        <ResultStep result={result} onImportAnother={reset} />
      )}
    </div>
  );
}
