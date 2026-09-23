/**
 * ============================================================================
 * SHARED CONTRACTS — single source of truth for every module in this app.
 * All modules (parsers, categorizer, API routes, UI pages) MUST conform to
 * the types and module signatures documented here. Do not redefine these
 * shapes locally.
 * ============================================================================
 *
 * CORE CONVENTIONS
 * - Money is ALWAYS integer pence. Stored/transferred `amountPence` is ALWAYS
 *   "negative = money leaving the user, positive = money in", normalised at
 *   parse time regardless of the bank's own convention (e.g. Amex exports
 *   positive = spend → the Amex preset inverts).
 * - Dates in DTOs are ISO strings: transaction dates "yyyy-MM-dd", months "yyyy-MM".
 * - Categories referenced by id in the DB, by name in the builtin dictionary.
 * - Category.type: "expense" | "income" | "transfer". Transactions whose
 *   category has type "transfer" are EXCLUDED from all spend/income/budget
 *   aggregations in /api/stats. Uncategorised transactions count toward
 *   income/expense totals by sign, appear as an "Uncategorised" slice in the
 *   donut (categoryId null, color "#475569", icon "❓"), but count toward no budget.
 * - Transaction.categorySource: "none" | "builtin" | "rule" | "manual".
 *   A "manual" categorisation is NEVER overwritten by rules, re-imports, or
 *   "apply to existing" operations.
 */

// ============================================================================
// PARSING — module `@/lib/parsers` (lib/parsers/index.ts)
//
// Exports:
//   PRESETS: BankPreset[]                 — all bank presets, for UI listing
//   parseCsv(csvText: string, opts?: { presetId?: string; mapping?: ColumnMapping }): ParseResult
//   parseAmountToPence(raw: string): number | null
//       — strips £, commas, spaces; handles "(12.34)" and "12.34 DR" as negative,
//         "CR" suffix as positive; returns null when unparseable
//
// parseCsv behaviour:
//   - Parses with PapaParse (header: false), trims cells.
//   - Scans the first ~10 rows to locate the real header row (Nationwide has
//     3-4 preamble lines, Santander-style exports have preamble too). The
//     header row is the one matching a preset's expected headers, or for
//     mapping mode the row containing the mapped column names.
//   - HSBC exports have NO header row: structural detection = exactly 3
//     columns, col0 parses as dd/mm/yyyy, col2 parses as a signed amount.
//     Headerless files get synthetic headers "col0", "col1", ...
//   - If opts.presetId given, use that preset. Else if opts.mapping given, use
//     the generic mapper (resulting presetId "generic"). Else auto-detect; if
//     nothing detects, return presetId "unknown" with rows=[] and headers
//     populated so the UI can show the column mapper.
//   - Rows that fail to parse (bad date/amount) are skipped and reported in
//     warnings, never thrown.
// ============================================================================

/** One parsed statement row, bank-convention already normalised. */
export interface ParsedTransaction {
  /** ISO "yyyy-MM-dd" */
  date: string;
  /** Raw description text from the statement */
  description: string;
  /** Negative = money out, positive = money in */
  amountPence: number;
}

export interface BankPreset {
  /** e.g. "monzo", "lloyds", "amex" */
  id: string;
  /** e.g. "Monzo", "Lloyds / Halifax / Bank of Scotland / TSB", "American Express" */
  name: string;
  /**
   * headers: lower-cased, trimmed cells of the located header row
   * (empty array when the file has no header row).
   * sampleRows: up to 5 raw data rows for structural detection (HSBC).
   */
  detect(headers: string[], sampleRows: string[][]): boolean;
  /**
   * records: data rows keyed by the original (trimmed) header names, or
   * "col0".."colN" for headerless files.
   */
  parse(records: Record<string, string>[]): ParsedTransaction[];
}

/** Generic column mapper — the universal fallback for unknown banks. */
export interface ColumnMapping {
  dateColumn: string;
  descriptionColumn: string;
  /** Single signed amount column… */
  amountColumn?: string;
  /** …or split debit/credit columns (both positive numbers, one blank per row) */
  debitColumn?: string;
  creditColumn?: string;
  dateFormat: "dmy" | "ymd" | "mdy";
  /** For credit-card exports where positive = spend */
  invertAmount?: boolean;
}

export interface ParseResult {
  /** Detected/used preset id, "generic" for mapping mode, "unknown" if undetected */
  presetId: string;
  presetName: string;
  /** Original header names as found in the file (or "col0".. for headerless) */
  headers: string[];
  rows: ParsedTransaction[];
  /** Skipped-row notices, balance-check failures, etc. Non-fatal. */
  warnings: string[];
}

// ============================================================================
// CATEGORISATION — module `@/lib/categorize` (lib/categorize/index.ts)
//
// Exports:
//   normalizeDescription(raw: string): string
//       — UPPERCASE, whitespace-collapsed, bank noise stripped (txn-type
//         prefixes like "CARD PAYMENT TO"/"DD"/"SO"/"BGC"/"VIS", aggregator
//         prefixes like "PAYPAL *"/"SQ *"/"SUMUP *"/"ZTL*"/"IZ *", reference
//         numbers, card masks, embedded dates/times, trailing country codes,
//         FX rate noise). Used for rule/dictionary matching.
//   displayMerchant(raw: string): string
//       — human-friendly Title-Cased merchant name derived from the
//         normalised description (e.g. "TESCO STORES 2345" → "Tesco Stores")
//   categorize(description: string, userRules: UserRule[]): CategorizationResult
//       — normalises, then matches user rules first, then the builtin UK
//         dictionary; ALL patterns (user + builtin together, user winning
//         ties) are tried longest-pattern-first. Substring match on the
//         normalised description.
//
// lib/categorize/uk-merchants.ts exports:
//   UK_MERCHANTS: { pattern: string; category: string }[]
//       — 250+ UPPERCASE substring patterns → seeded category NAME, covering
//         UK supermarkets, food chains, transport (TFL, TRAINLINE…), fuel,
//         retail, utilities (BRITISH GAS, OCTOPUS…), telecoms, subscriptions,
//         council tax, transfer markers ("TRANSFER TO", "SAVINGS POT",
//         "PAYMENT RECEIVED - THANK YOU" → "Transfers"), etc.
// ============================================================================

export interface UserRule {
  /** UPPERCASE substring */
  pattern: string;
  categoryName: string;
}

export interface CategorizationResult {
  /** Seeded category NAME, or null when nothing matched */
  categoryName: string | null;
  matchedPattern: string | null;
  source: "rule" | "builtin" | null;
}

// ============================================================================
// IMPORT HASHING — module `@/lib/import-hash` (lib/import-hash.ts)
//
// Exports:
//   contentHash(accountId: string, t: ParsedTransaction): string
//       — sha256 of `${accountId}|${t.date}|${t.amountPence}|${canon(t.description)}`
//         where canon = uppercase + collapse whitespace + trim (STABLE — do
//         not use full normalizeDescription here, hashes must never change
//         when categorisation rules evolve).
//   importHash = `${contentHash}:${dupSeq}` is what's stored on Transaction.
//
// DEDUPE PROTOCOL (content-based, idempotent across overlapping exports):
//   Preview: group incoming rows by contentHash; query DB count of rows whose
//   importHash startsWith `${hash}:`; the first `existingCount` rows of each
//   group are flagged duplicate, the rest are new.
//   Commit: recompute everything server-side (NEVER trust client hashes);
//   for each group insert only the delta beyond existingCount, assigning
//   dupSeq = existingCount, existingCount+1, …  Commit is strictly
//   INSERT-ONLY: existing rows (and their user-set categories) are never
//   touched by an import.
// ============================================================================

// ============================================================================
// API DTOs — implemented by `app/api/**` route handlers, consumed by UI pages.
// All endpoints return JSON; errors as { error: string } with 4xx/5xx status.
//
// ENDPOINT INDEX
//   GET    /api/transactions?month=yyyy-MM&categoryId=&accountId=&q=&uncategorized=true&limit=&offset=
//            → TransactionListResponse  (sorted date desc; q searches description/merchant/notes)
//   POST   /api/transactions            body CreateTransactionRequest → TxnDTO (201)
//   PATCH  /api/transactions/:id        body UpdateTransactionRequest → TxnDTO
//   DELETE /api/transactions/:id        → { ok: true }
//   GET    /api/categories              → CategoryDTO[]
//   POST   /api/categories              body { name, type, color, icon } → CategoryDTO (201)
//   PATCH  /api/categories/:id          body Partial<{ name, type, color, icon }> → CategoryDTO
//   DELETE /api/categories/:id          → { ok: true }  (transactions become uncategorised)
//   GET    /api/budgets                 → BudgetDTO[]
//   PUT    /api/budgets                 body SetBudgetsRequest → BudgetDTO[]
//   GET    /api/rules                   → RuleDTO[]
//   POST   /api/rules                   body CreateRuleRequest → RuleDTO (201)
//   DELETE /api/rules/:id               → { ok: true }
//   GET    /api/accounts                → AccountDTO[]
//   POST   /api/accounts                body { name, type } → AccountDTO (201)
//   DELETE /api/accounts/:id            → { ok: true }  (transactions keep accountId=null)
//   POST   /api/import/preview          body PreviewRequest → PreviewResponse
//   POST   /api/import/commit           body CommitRequest → CommitResponse
//   GET    /api/stats?month=yyyy-MM     → StatsResponse
// ============================================================================

export interface CategoryRef {
  id: string;
  name: string;
  color: string;
  icon: string;
  type: string;
}

export interface TxnDTO {
  id: string;
  /** ISO yyyy-MM-dd */
  date: string;
  description: string;
  merchant: string | null;
  amountPence: number;
  source: string;
  notes: string | null;
  categorySource: string;
  category: CategoryRef | null;
  account: { id: string; name: string; type: string } | null;
}

export interface TransactionListResponse {
  transactions: TxnDTO[];
  total: number;
}

export interface CreateTransactionRequest {
  /** ISO yyyy-MM-dd */
  date: string;
  description: string;
  amountPence: number;
  categoryId?: string;
  accountId?: string;
  notes?: string;
}

export interface UpdateTransactionRequest {
  /** null clears the category; setting a category id marks categorySource "manual" */
  categoryId?: string | null;
  notes?: string;
  /** When present alongside categoryId: also save a CategoryRule */
  createRule?: {
    /** UPPERCASE substring; default suggestion = normalised description */
    pattern: string;
    /** Re-categorise existing txns matching the pattern whose categorySource != "manual" */
    applyToExisting: boolean;
  };
}

export interface CategoryDTO {
  id: string;
  name: string;
  type: string;
  color: string;
  icon: string;
  txnCount: number;
  budgetPence: number | null;
}

export interface BudgetDTO {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  amountPence: number;
}

export interface SetBudgetsRequest {
  /** amountPence null deletes the budget for that category */
  budgets: { categoryId: string; amountPence: number | null }[];
}

export interface RuleDTO {
  id: string;
  pattern: string;
  category: CategoryRef;
  createdAt: string;
}

export interface CreateRuleRequest {
  pattern: string;
  categoryId: string;
  applyToExisting?: boolean;
}

export interface AccountDTO {
  id: string;
  name: string;
  type: string;
  institution: string;
  txnCount: number;
}

// ---------- Import ----------

export interface PreviewRequest {
  csvText: string;
  /** Account is upserted by name at preview time so dedupe can be checked */
  accountName: string;
  /** "current" | "savings" | "credit_card" — used only when creating */
  accountType?: string;
  presetId?: string;
  mapping?: ColumnMapping;
}

export interface PreviewRow extends ParsedTransaction {
  /** displayMerchant() result */
  merchant: string;
  categoryName: string | null;
  categorySource: "rule" | "builtin" | null;
  /** Already present in the DB for this account (content-hash count check) */
  duplicate: boolean;
}

export interface PreviewResponse {
  accountId: string;
  presetId: string;
  presetName: string;
  headers: string[];
  rows: PreviewRow[];
  warnings: string[];
  newCount: number;
  duplicateCount: number;
}

export interface CommitRequest {
  accountId: string;
  /** Preset name for Transaction.source, e.g. "Monzo" */
  source: string;
  rows: {
    date: string;
    description: string;
    merchant: string;
    /** Category chosen/edited in the preview UI; null = leave uncategorised */
    categoryName: string | null;
    /**
     * "rule"/"builtin" when auto-categorised and untouched in the preview,
     * "manual" when the user picked/changed the category in the preview UI,
     * null when uncategorised.
     */
    categorySource: "rule" | "builtin" | "manual" | null;
    amountPence: number;
  }[];
}

export interface CommitResponse {
  inserted: number;
  skippedDuplicates: number;
}

// ---------- Stats ----------

export interface CategorySpend {
  /** null = the Uncategorised pseudo-slice */
  categoryId: string | null;
  name: string;
  color: string;
  icon: string;
  spendPence: number; // positive number = total spent this month
}

export interface BudgetProgress {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  budgetPence: number;
  spentPence: number; // positive number
}

export interface TrendPoint {
  /** "yyyy-MM" */
  month: string;
  spendPence: number; // positive
  incomePence: number; // positive
}

export interface StatsResponse {
  month: string;
  totalSpendPence: number; // positive; transfers excluded
  totalIncomePence: number; // positive; transfers excluded
  netPence: number; // income - spend
  uncategorizedCount: number; // in the selected month
  byCategory: CategorySpend[]; // selected month, spend side, sorted desc, incl. Uncategorised slice
  budgets: BudgetProgress[]; // every category that has a budget
  trend: TrendPoint[]; // last 12 months ending at selected month
}
