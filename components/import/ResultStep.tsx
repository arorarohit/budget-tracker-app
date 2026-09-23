"use client";

import React from "react";
import Link from "next/link";
import { Button, Card } from "@/components/ui";
import type { CommitResponse } from "@/lib/types";

export default function ResultStep({
  result,
  onImportAnother,
}: {
  result: CommitResponse;
  onImportAnother: () => void;
}) {
  const { inserted, skippedDuplicates } = result;
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="text-5xl">✅</div>
        <div className="text-lg font-semibold text-slate-100">
          Imported {inserted} transaction{inserted === 1 ? "" : "s"}
        </div>
        <div className="text-sm text-slate-400">
          {skippedDuplicates} duplicate
          {skippedDuplicates === 1 ? "" : "s"} skipped
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Link href="/">
            <Button variant="primary">View dashboard</Button>
          </Link>
          <Link href="/transactions">
            <Button variant="secondary">View transactions</Button>
          </Link>
          <Button variant="ghost" onClick={onImportAnother}>
            Import another
          </Button>
        </div>
      </div>
    </Card>
  );
}
