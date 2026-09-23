"use client";

import { addMonths, currentMonth, formatMonth } from "@/lib/format";
import { Button } from "@/components/ui";

export default function MonthPicker({
  month,
  onChange,
}: {
  /** "yyyy-MM" */
  month: string;
  onChange: (month: string) => void;
}) {
  const isCurrent = month === currentMonth();
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" onClick={() => onChange(addMonths(month, -1))} aria-label="Previous month">
        ‹
      </Button>
      <span className="min-w-32 text-center text-sm font-medium">
        {formatMonth(month)}
      </span>
      <Button
        variant="ghost"
        onClick={() => onChange(addMonths(month, 1))}
        disabled={isCurrent}
        aria-label="Next month"
      >
        ›
      </Button>
      {!isCurrent && (
        <Button variant="ghost" onClick={() => onChange(currentMonth())}>
          Today
        </Button>
      )}
    </div>
  );
}
