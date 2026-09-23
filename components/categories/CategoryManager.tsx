"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Button, Card, CardTitle, Input, Select, Spinner } from "@/components/ui";
import type { CategoryDTO } from "@/lib/types";

const TYPES = ["expense", "income", "transfer"] as const;
const DEFAULT_COLOR = "#64748b";
const DEFAULT_ICON = "🏷️";

interface RowDraft {
  name: string;
  type: string;
  color: string;
  icon: string;
}

function toDraft(c: CategoryDTO): RowDraft {
  return { name: c.name, type: c.type, color: c.color, icon: c.icon };
}

function isDirty(c: CategoryDTO, d: RowDraft): boolean {
  return (
    c.name !== d.name ||
    c.type !== d.type ||
    c.color !== d.color ||
    c.icon !== d.icon
  );
}

export default function CategoryManager({
  categories,
  onChanged,
}: {
  categories: CategoryDTO[];
  /** Called after any successful mutation so the parent can refetch. */
  onChanged: () => void | Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  // New-category form state.
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<string>("expense");
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [newIcon, setNewIcon] = useState(DEFAULT_ICON);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Sync drafts when the upstream category list changes.
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, RowDraft> = {};
      for (const c of categories) {
        // Preserve in-flight edits for ids still present, else reset from server.
        next[c.id] = prev[c.id] ?? toDraft(c);
      }
      return next;
    });
  }, [categories]);

  const setRowErr = useCallback((id: string, msg: string | null) => {
    setRowError((prev) => {
      const next = { ...prev };
      if (msg === null) delete next[id];
      else next[id] = msg;
      return next;
    });
  }, []);

  const updateDraft = useCallback((id: string, patch: Partial<RowDraft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const handleSaveRow = useCallback(
    async (c: CategoryDTO) => {
      const d = drafts[c.id];
      if (!d) return;
      setBusyId(c.id);
      setRowErr(c.id, null);
      try {
        const res = await fetch(`/api/categories/${c.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: d.name,
            type: d.type,
            color: d.color,
            icon: d.icon,
          }),
        });
        if (!res.ok) {
          const data: { error?: string } = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to save category");
        }
        await onChanged();
      } catch (e) {
        setRowErr(c.id, e instanceof Error ? e.message : "Failed to save");
      } finally {
        setBusyId(null);
      }
    },
    [drafts, onChanged, setRowErr],
  );

  const handleDeleteRow = useCallback(
    async (c: CategoryDTO) => {
      const msg =
        c.txnCount > 0
          ? `${c.txnCount} transaction${c.txnCount === 1 ? "" : "s"} will become uncategorised. Delete "${c.name}"?`
          : `Delete "${c.name}"?`;
      if (!window.confirm(msg)) return;
      setBusyId(c.id);
      setRowErr(c.id, null);
      try {
        const res = await fetch(`/api/categories/${c.id}`, { method: "DELETE" });
        if (!res.ok) {
          const data: { error?: string } = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to delete category");
        }
        await onChanged();
      } catch (e) {
        setRowErr(c.id, e instanceof Error ? e.message : "Failed to delete");
      } finally {
        setBusyId(null);
      }
    },
    [onChanged, setRowErr],
  );

  const handleAdd = useCallback(async () => {
    if (newName.trim() === "") {
      setAddError("Name is required");
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          type: newType,
          color: newColor,
          icon: newIcon.trim() === "" ? DEFAULT_ICON : newIcon.trim(),
        }),
      });
      if (!res.ok) {
        const data: { error?: string } = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add category");
      }
      setNewName("");
      setNewType("expense");
      setNewColor(DEFAULT_COLOR);
      setNewIcon(DEFAULT_ICON);
      await onChanged();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to add category");
    } finally {
      setAdding(false);
    }
  }, [newName, newType, newColor, newIcon, onChanged]);

  return (
    <Card>
      <CardTitle>Categories</CardTitle>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="pb-2 pr-3 font-medium">Icon</th>
              <th className="pb-2 pr-3 font-medium">Name</th>
              <th className="pb-2 pr-3 font-medium">Type</th>
              <th className="pb-2 pr-3 font-medium">Color</th>
              <th className="pb-2 pr-3 text-right font-medium">Txns</th>
              <th className="pb-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {categories.map((c) => {
              const d = drafts[c.id] ?? toDraft(c);
              const dirty = isDirty(c, d);
              const busy = busyId === c.id;
              const err = rowError[c.id];
              return (
                <React.Fragment key={c.id}>
                  <tr>
                    <td className="py-2 pr-3">
                      <Input
                        className="w-12 text-center"
                        value={d.icon}
                        maxLength={4}
                        aria-label={`Icon for ${c.name}`}
                        onChange={(e) => updateDraft(c.id, { icon: e.target.value })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        className="w-full min-w-32"
                        value={d.name}
                        aria-label={`Name for ${c.name}`}
                        onChange={(e) => updateDraft(c.id, { name: e.target.value })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Select
                        value={d.type}
                        aria-label={`Type for ${c.name}`}
                        onChange={(e) => updateDraft(c.id, { type: e.target.value })}
                      >
                        {TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="color"
                        value={d.color}
                        aria-label={`Color for ${c.name}`}
                        onChange={(e) => updateDraft(c.id, { color: e.target.value })}
                        className="h-8 w-10 cursor-pointer rounded border border-slate-700 bg-slate-900"
                      />
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-500">
                      {c.txnCount}
                    </td>
                    <td className="py-2 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Button
                          variant="primary"
                          disabled={!dirty || busy}
                          onClick={() => handleSaveRow(c)}
                        >
                          {busy ? <Spinner /> : null}
                          Save
                        </Button>
                        <Button
                          variant="danger"
                          disabled={busy}
                          onClick={() => handleDeleteRow(c)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {err && (
                    <tr>
                      <td colSpan={6} className="pb-2 text-xs text-red-400">
                        {err}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {/* Add-category form row */}
            <tr>
              <td className="py-2 pr-3">
                <Input
                  className="w-12 text-center"
                  value={newIcon}
                  maxLength={4}
                  aria-label="New category icon"
                  onChange={(e) => setNewIcon(e.target.value)}
                />
              </td>
              <td className="py-2 pr-3">
                <Input
                  className="w-full min-w-32"
                  value={newName}
                  placeholder="New category name"
                  aria-label="New category name"
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleAdd();
                  }}
                />
              </td>
              <td className="py-2 pr-3">
                <Select
                  value={newType}
                  aria-label="New category type"
                  onChange={(e) => setNewType(e.target.value)}
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </td>
              <td className="py-2 pr-3">
                <input
                  type="color"
                  value={newColor}
                  aria-label="New category color"
                  onChange={(e) => setNewColor(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-slate-700 bg-slate-900"
                />
              </td>
              <td className="py-2 pr-3" />
              <td className="py-2 text-right">
                <Button variant="primary" disabled={adding} onClick={handleAdd}>
                  {adding ? <Spinner /> : null}
                  Add
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {addError && (
        <div className="mt-2 text-xs text-red-400">{addError}</div>
      )}
    </Card>
  );
}
