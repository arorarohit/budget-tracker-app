/**
 * Transaction categorisation engine — `@/lib/categorize`.
 *
 * Public surface (per the contract in lib/types.ts):
 *   - normalizeDescription(raw)            (re-exported)
 *   - displayMerchant(raw)                 (re-exported)
 *   - categorize(description, userRules)   → CategorizationResult
 *   - UK_MERCHANTS                         (re-exported dictionary)
 */

import type { UserRule, CategorizationResult } from "@/lib/types";
import { normalizeDescription, displayMerchant } from "@/lib/categorize/normalize";
import { UK_MERCHANTS } from "@/lib/categorize/uk-merchants";

export { normalizeDescription, displayMerchant } from "@/lib/categorize/normalize";
export { UK_MERCHANTS } from "@/lib/categorize/uk-merchants";
export type { MerchantEntry } from "@/lib/categorize/uk-merchants";

/** Internal candidate shape used during matching. */
interface Candidate {
  pattern: string;
  categoryName: string;
  source: "rule" | "builtin";
}

/**
 * Builtin candidates, precomputed once. User rules are merged in per call
 * (they vary by caller) — see categorize().
 */
const BUILTIN_CANDIDATES: Candidate[] = UK_MERCHANTS.map((m) => ({
  pattern: m.pattern.toUpperCase(),
  categoryName: m.category,
  source: "builtin" as const,
}));

/**
 * Categorise a raw description.
 *
 * Algorithm (matches the lib/types.ts contract):
 *  1. Normalise the description ONCE.
 *  2. Merge user rules and builtin dictionary entries into one candidate list.
 *  3. Sort ALL candidates by pattern length DESC. On equal length, user rules
 *     win over builtins (stable: user candidates are placed first so the
 *     length-DESC sort — which we keep stable — keeps them ahead on ties).
 *  4. The first candidate whose pattern is a substring of the normalised
 *     description wins; return its category, the matched pattern, and source.
 *  5. If nothing matches, return an all-null result.
 *
 * @param description Raw bank description (un-normalised).
 * @param userRules   The user's CategoryRules (UPPERCASE substrings).
 */
export function categorize(
  description: string,
  userRules: UserRule[],
): CategorizationResult {
  const normalized = normalizeDescription(description);

  if (!normalized) {
    return { categoryName: null, matchedPattern: null, source: null };
  }

  // User rules first so they precede builtins on equal-length ties.
  const userCandidates: Candidate[] = (userRules ?? []).map((r) => ({
    pattern: (r.pattern ?? "").toUpperCase(),
    categoryName: r.categoryName,
    source: "rule" as const,
  }));

  const candidates: Candidate[] = [...userCandidates, ...BUILTIN_CANDIDATES];

  // Sort longest-pattern-first. Array.prototype.sort is stable in modern JS, so
  // when two patterns have equal length the original order (user candidates
  // before builtin candidates) is preserved — i.e. user rules win ties.
  candidates.sort((a, b) => b.pattern.length - a.pattern.length);

  for (const c of candidates) {
    if (c.pattern.length === 0) continue; // never match an empty pattern
    if (normalized.includes(c.pattern)) {
      return {
        categoryName: c.categoryName,
        matchedPattern: c.pattern,
        source: c.source,
      };
    }
  }

  return { categoryName: null, matchedPattern: null, source: null };
}
