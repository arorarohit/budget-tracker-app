"use client";

/**
 * Searchable category picker — a text input that filters a dropdown list of
 * categories by name as you type, instead of a native <select> that forces
 * scrolling through every category to find one. Used anywhere a category must
 * be chosen from a potentially long list (Rules form, import preview rows).
 *
 * Keyboard support: ArrowUp/Down to move the highlighted option, Enter to
 * select it, Escape to close. Closes on outside click or on selection.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CategoryDTO } from "@/lib/types";

const UNCATEGORIZED_VALUE = "";

export default function CategoryCombobox({
  categories,
  value,
  onChange,
  placeholder = "Search categories…",
  uncategorizedLabel,
  disabled = false,
  className = "",
  "aria-label": ariaLabel,
}: {
  categories: CategoryDTO[];
  /** Selected category id, or "" for uncategorised/none */
  value: string;
  onChange: (categoryId: string) => void;
  placeholder?: string;
  /** When provided, an "uncategorised" option (value "") is offered first */
  uncategorizedLabel?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = categories.find((c) => c.id === value) ?? null;

  // Text shown in the input: the selected category's name while closed, or
  // the in-progress search query while open.
  const displayValue = open
    ? query
    : selected
      ? `${selected.icon} ${selected.name}`
      : uncategorizedLabel ?? "";

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? categories.filter((c) => c.name.toLowerCase().includes(q))
      : categories;
    const showUncat =
      uncategorizedLabel !== undefined &&
      (q === "" || uncategorizedLabel.toLowerCase().includes(q));
    return { filtered, showUncat };
  }, [categories, query, uncategorizedLabel]);

  const flatOptions: Array<{ id: string; label: string }> = [
    ...(options.showUncat
      ? [{ id: UNCATEGORIZED_VALUE, label: uncategorizedLabel! }]
      : []),
    ...options.filtered.map((c) => ({ id: c.id, label: `${c.icon} ${c.name}` })),
  ];

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  function openDropdown() {
    if (disabled) return;
    setQuery("");
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }

  function selectOption(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        openDropdown();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, flatOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = flatOptions[highlight];
      if (opt) selectOption(opt.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        disabled={disabled}
        onFocus={openDropdown}
        onChange={(e) => {
          if (!open) setOpen(true);
          setQuery(e.target.value);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {open && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full min-w-[12rem] overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-lg"
        >
          {flatOptions.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">No matches</li>
          ) : (
            flatOptions.map((opt, i) => (
              <li
                key={opt.id || "__uncat__"}
                role="option"
                aria-selected={opt.id === value}
                onMouseDown={(e) => {
                  // mousedown (not click) so it fires before the input's blur.
                  e.preventDefault();
                  selectOption(opt.id);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`cursor-pointer px-3 py-1.5 text-sm ${
                  i === highlight
                    ? "bg-emerald-600/20 text-emerald-300"
                    : "text-slate-200 hover:bg-slate-800"
                } ${opt.id === value ? "font-medium" : ""}`}
              >
                {opt.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
