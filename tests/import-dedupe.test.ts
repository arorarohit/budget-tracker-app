import { describe, expect, it, vi } from "vitest";
import { loadExistingImportCounts } from "@/lib/import-dedupe";

describe("loadExistingImportCounts", () => {
  it("counts existing sequences and queries large imports in sequential batches", async () => {
    const hashes = Array.from({ length: 201 }, (_, index) =>
      index.toString(16).padStart(64, "0")
    );
    const batches: string[][] = [];
    const findExistingImportHashes = vi.fn(async (batch: string[]) => {
      batches.push(batch);
      return batch.flatMap((hash) =>
        hash === hashes[0]
          ? [{ importHash: `${hash}:0` }, { importHash: `${hash}:1` }]
          : hash === hashes[100]
            ? [{ importHash: `${hash}:0` }]
            : []
      );
    });

    const counts = await loadExistingImportCounts(hashes, findExistingImportHashes);

    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 1]);
    expect(findExistingImportHashes).toHaveBeenCalledTimes(3);
    expect(counts.get(hashes[0])).toBe(2);
    expect(counts.get(hashes[100])).toBe(1);
    expect(counts.get(hashes[200])).toBe(0);
  });

  it("does not query the database for an empty hash list", async () => {
    const findExistingImportHashes = vi.fn(async () => []);

    const counts = await loadExistingImportCounts([], findExistingImportHashes);

    expect(counts.size).toBe(0);
    expect(findExistingImportHashes).not.toHaveBeenCalled();
  });
});
