const HASH_BATCH_SIZE = 100;

export async function loadExistingImportCounts(
  hashes: string[],
  findExistingImportHashes: (
    batch: string[]
  ) => Promise<Array<{ importHash: string | null }>>
): Promise<Map<string, number>> {
  const counts = new Map(hashes.map((hash) => [hash, 0]));

  for (let start = 0; start < hashes.length; start += HASH_BATCH_SIZE) {
    const batch = hashes.slice(start, start + HASH_BATCH_SIZE);
    const existing = await findExistingImportHashes(batch);

    for (const { importHash } of existing) {
      if (importHash === null) continue;
      const hash = importHash.slice(0, importHash.lastIndexOf(":"));
      counts.set(hash, (counts.get(hash) ?? 0) + 1);
    }
  }

  return counts;
}
