import { createHash } from "node:crypto";
import type { ParsedTransaction } from "@/lib/types";

/**
 * Stable canonicalisation for content hashing.
 * Uppercase + collapse internal whitespace + trim.
 *
 * IMPORTANT: this is deliberately NOT lib/categorize's normalizeDescription.
 * The content hash must remain stable for the lifetime of a transaction so the
 * dedupe protocol keeps working; normalizeDescription strips bank noise and can
 * change as categorisation rules evolve, which would silently change hashes.
 */
export function canon(description: string): string {
  return description.toUpperCase().replace(/\s+/g, " ").trim();
}

/**
 * Content-based hash of a parsed transaction within an account.
 * sha256 hex of `${accountId}|${date}|${amountPence}|${canon(description)}`.
 */
export function contentHash(accountId: string, t: ParsedTransaction): string {
  const payload = `${accountId}|${t.date}|${t.amountPence}|${canon(t.description)}`;
  return createHash("sha256").update(payload).digest("hex");
}

/** Compose the stored importHash from a content hash and dedupe sequence. */
export function buildImportHash(hash: string, seq: number): string {
  return `${hash}:${seq}`;
}
