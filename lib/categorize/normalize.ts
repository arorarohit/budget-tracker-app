/**
 * Description normalisation for the categorisation engine.
 *
 * `normalizeDescription` turns a raw bank-statement description into a stable,
 * UPPERCASE, noise-free string suitable for substring matching against the
 * builtin UK merchant dictionary and user rules. `displayMerchant` derives a
 * human-friendly Title-Cased merchant name from that normalised form.
 *
 * NOTE: this is intentionally NOT the same canonicalisation used by
 * `@/lib/import-hash` (which must stay frozen so content hashes never change as
 * categorisation rules evolve). Keep the two independent.
 */

/**
 * Leading bank transaction-type prefixes, anchored at the start of the string
 * and stripped repeatedly (a single statement line can carry several in
 * sequence, e.g. "CARD PAYMENT TO ..."). Ordered LONGEST-FIRST within the
 * alternation so that e.g. "CARD PAYMENT TO" is consumed before "CARD".
 *
 * These are matched word-boundary anchored at the *start* only — we never strip
 * these tokens from the middle of a merchant name (so "VISA" the brand inside a
 * description body survives; only a *leading* "VISA " prefix is removed).
 */
const TXN_TYPE_PREFIXES: string[] = [
  // multi-word, longest first
  "CONTACTLESS PAYMENT TO",
  "DIRECT DEBIT PAYMENT TO",
  "CARD PAYMENT TO",
  "STANDING ORDER TO",
  "FASTER PAYMENT",
  "CASH WITHDRAWAL",
  "ATM WITHDRAWAL",
  "DIRECT DEBIT",
  "STANDING ORDER",
  "CARD PURCHASE",
  "CONTACTLESS",
  "POS DEBIT",
  // single-word / abbreviations
  "CHAPS",
  "MAESTRO",
  "MAES",
  "VISA",
  "VIS",
  "BACS",
  "FPI",
  "FPO",
  "CHAPS",
  "BGC",
  "TFR",
  "POS",
  "MCD",
  "CRD",
  "BCC",
  "FPS",
  "D/D",
  "DD",
  "S/O",
  "SO",
  "BP", // leading payment-type "BP" (bill payment). COLLISION: BP-the-fuel-brand
        // also leads with "BP " (e.g. "BP CONNECT"). We special-case that below:
        // a leading "BP" is NOT stripped when followed by a known BP fuel token.
];

/**
 * Tokens that, when they immediately follow a leading "BP", mean it's BP the
 * fuel retailer rather than a "bill payment" prefix — so "BP" must be kept.
 */
const BP_FUEL_FOLLOWERS = /^BP\s+(?:CONNECT|FUEL|GARAGE|PULSE|SERVICE|STATION|OIL)\b/;

/**
 * Payment-aggregator prefixes. We strip the aggregator marker so the underlying
 * merchant token is exposed for dictionary matching (e.g. "PAYPAL *NETFLIX.COM"
 * → "NETFLIX.COM"). Square/SumUp/Zettle/iZettle card-acquirer prefixes behave
 * the same way. The "GOOGLE *" marker also fronts subscription billing.
 */
const AGGREGATOR_PREFIXES: string[] = [
  "PAYPAL *",
  "PAYPAL*",
  "SQ *",
  "SQ*",
  "SUMUP *",
  "SUMUP*",
  "ZTL*",
  "ZTL *",
  "IZ *",
  "IZ*",
  "GOOGLE *",
  "GOOGLE*",
];

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Build a single anchored regex that consumes one leading txn-type prefix.
// `\b`-style boundary: the prefix must be followed by whitespace or end.
const TXN_PREFIX_RE = new RegExp(
  "^(?:" + TXN_TYPE_PREFIXES.map(esc).join("|") + ")(?=\\s|$)",
);

/**
 * Normalise a raw description. Steps applied strictly in order — see the module
 * contract in lib/types.ts and the build prompt.
 */
export function normalizeDescription(raw: string): string {
  if (!raw) return "";

  // 1. Uppercase, collapse whitespace, trim.
  let s = raw.toUpperCase().replace(/\s+/g, " ").trim();

  // 2. Strip a single leading Monzo/Revolut "*" card glyph, then strip leading
  //    bank transaction-type prefixes repeatedly.
  s = s.replace(/^\*\s*/, "").trim();
  for (;;) {
    // Guard: keep a leading "BP" that is BP-the-fuel-retailer, not the
    // "bill payment" prefix.
    if (BP_FUEL_FOLLOWERS.test(s)) break;
    const next = s.replace(TXN_PREFIX_RE, "").trim();
    if (next === s) break;
    s = next;
    // also re-eat a "*" that a prefix may have exposed (e.g. "BP *MERCHANT")
    s = s.replace(/^\*\s*/, "").trim();
  }

  // 3. Strip payment-aggregator prefixes (PAYPAL *, SQ *, SUMUP *, ZTL*, IZ *,
  //    GOOGLE *). Loop in case of stacking (rare, e.g. "PAYPAL *SQ *...").
  for (;;) {
    let changed = false;
    for (const p of AGGREGATOR_PREFIXES) {
      if (s.startsWith(p)) {
        s = s.slice(p.length).trim();
        changed = true;
      }
    }
    if (!changed) break;
  }

  // 4. Strip reference / metadata noise anywhere in the string.
  // FX noise: "12.00 EUR @ 1.17" and bare "RATE 1.17".
  s = s.replace(
    /\b\d+(?:\.\d+)?\s*[A-Z]{3}\s*@\s*\d+(?:\.\d+)?\b/g,
    " ",
  );
  s = s.replace(/\bRATE\s+\d+(?:\.\d+)?\b/g, " ");
  // Embedded dates: "ON 12 MAY 2026", "ON 12 MAY 26".
  s = s.replace(/\bON\s+\d{2}\s+[A-Z]{3}\s+\d{2,4}\b/g, " ");
  // "12MAY26" style.
  s = s.replace(/\b\d{2}[A-Z]{3}\d{2}\b/g, " ");
  // Numeric dates dd-mm-yy(yy) / dd/mm/yy(yy).
  s = s.replace(/\b\d{2}[-/]\d{2}[-/]\d{2,4}\b/g, " ");
  // Times hh:mm(:ss).
  s = s.replace(/\b\d{2}:\d{2}(?::\d{2})?\b/g, " ");
  // "REF" followed by an alphanumeric reference token.
  s = s.replace(/\bREF[:\s#]*[A-Z0-9]+\b/g, " ");
  // Card masks: 1234********5678, X{2,}digits, long masked runs.
  s = s.replace(/\b\d{4,}\*{2,}\d{2,}\b/g, " ");
  s = s.replace(/\bX{2,}\d+\b/g, " ");
  s = s.replace(/\b\d+X{2,}\d*\b/g, " ");
  s = s.replace(/\*{2,}\d+\b/g, " ");
  // Runs of 6+ digits (long reference / account numbers).
  s = s.replace(/\b\d{6,}\b/g, " ");

  s = s.replace(/\s+/g, " ").trim();

  // 5. Strip trailing country / location tokens, repeatedly (e.g. "... GB GBP").
  for (;;) {
    const next = s
      .replace(/\s+(?:GBP|GBR|GB|UK)$/g, "")
      // a trailing bare 2-letter country/region code token
      .replace(/\s+[A-Z]{2}$/g, "")
      .trim();
    if (next === s) break;
    s = next;
  }

  // 6. Strip punctuation noise but KEEP single & and ' and - inside names.
  //    Remove commas, # and runs of dots / asterisks; collapse repeated & ' -.
  s = s.replace(/[,#]/g, " ");
  s = s.replace(/\.{2,}/g, " "); // repeated dots
  s = s.replace(/\*+/g, " "); // any remaining asterisks
  // Lone dots that are not part of a domain-ish token become spaces.
  s = s.replace(/\s\.\s/g, " ");
  s = s.replace(/\s\.|\.\s/g, " ");
  // Collapse repeated allowed connectors so "TONI && GUY" → "TONI & GUY".
  s = s.replace(/&{2,}/g, "&");
  s = s.replace(/'{2,}/g, "'");
  s = s.replace(/-{2,}/g, "-");

  s = s.replace(/\s+/g, " ").trim();

  return s;
}

const SHORT_ALLCAPS = new Set<string>([
  "BP",
  "EE",
  "KFC",
  "TFL",
  "O2",
  "M&S",
  "B&Q",
  "B&M",
  "TK",
  "JD",
  "DFS",
  "BT",
  "TUI",
  "SSE",
  "EDF",
  "AXA",
  "LV",
  "P&O",
  "TGI",
  "NHS",
  "AA",
  "RAC",
  "H&M",
  "ASK",
  "DVLA",
  "HMRC",
  "NCP",
  "PDSA",
  "RSPCA",
  "RSPB",
  "NS&I",
  "ITV",
  "BBC",
  "UK",
  "GB",
]);

function titleToken(tok: string): string {
  if (SHORT_ALLCAPS.has(tok)) return tok;
  // Keep tokens that look like acronyms / brand glyphs (<= 3 chars, all caps,
  // containing only A-Z & or digit) uppercase.
  if (tok.length <= 3 && /^[A-Z&0-9]+$/.test(tok) && /[A-Z]/.test(tok)) {
    return tok;
  }
  // Title-case each &/-/' separated sub-part so "FRANKIE & BENNY" → "Frankie & Benny",
  // "FAT-FACE" → "Fat-Face".
  return tok
    .toLowerCase()
    .replace(/(^|[&'\-/])([a-z0-9])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * Human-friendly merchant name: normalise, then keep the leading run of "name"
 * tokens (stop before the first token that is purely numeric or starts with a
 * digit), then Title Case. Short all-caps brand tokens (BP, EE, KFC, TFL, M&S)
 * are preserved uppercase.
 */
export function displayMerchant(raw: string): string {
  const norm = normalizeDescription(raw);
  if (!norm) return "";

  const tokens = norm.split(" ");
  const nameTokens: string[] = [];
  for (const tok of tokens) {
    // Stop at the first token that begins with a digit (leftover store numbers,
    // ids, etc.). Pure-number or number-led tokens end the merchant name.
    if (/^\d/.test(tok)) break;
    nameTokens.push(tok);
  }
  // If everything was stripped (e.g. starts with a number), fall back to all
  // tokens so we never return empty for a non-empty normalised string.
  const chosen = nameTokens.length > 0 ? nameTokens : tokens;

  return chosen.map(titleToken).join(" ").trim();
}
