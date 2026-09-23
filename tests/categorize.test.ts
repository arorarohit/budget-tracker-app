import { describe, it, expect } from "vitest";
import {
  categorize,
  normalizeDescription,
  displayMerchant,
  UK_MERCHANTS,
} from "@/lib/categorize";
import type { UserRule } from "@/lib/types";

// Category names seeded in prisma/seed.ts — every dictionary entry MUST use one.
const SEEDED_CATEGORIES = new Set<string>([
  "Groceries",
  "Eating Out",
  "Coffee & Snacks",
  "Transport",
  "Fuel",
  "Shopping",
  "Clothing",
  "Health & Pharmacy",
  "Entertainment",
  "Subscriptions",
  "Utilities",
  "Council Tax",
  "Rent & Mortgage",
  "Insurance",
  "Phone & Internet",
  "Home & DIY",
  "Personal Care",
  "Kids & Education",
  "Pets",
  "Travel & Holidays",
  "Charity",
  "Cash Withdrawal",
  "Fees & Charges",
  "Savings & Investments",
  "Transfers",
  "Salary",
  "Other Income",
]);

describe("UK_MERCHANTS dictionary integrity", () => {
  it("meets the 250+ minimum from the contract", () => {
    // lib/types.ts requires "250+"; we ship a broad UK dictionary well above
    // that. Upper bound is a generous sanity ceiling, not a contract limit.
    expect(UK_MERCHANTS.length).toBeGreaterThanOrEqual(250);
    expect(UK_MERCHANTS.length).toBeLessThanOrEqual(1000);
  });

  it("only references seeded category names (exact spelling)", () => {
    for (const entry of UK_MERCHANTS) {
      expect(SEEDED_CATEGORIES.has(entry.category)).toBe(true);
    }
  });

  it("has only UPPERCASE patterns and no empty patterns", () => {
    for (const entry of UK_MERCHANTS) {
      expect(entry.pattern.length).toBeGreaterThan(0);
      expect(entry.pattern).toBe(entry.pattern.toUpperCase());
    }
  });

  it("has no duplicate patterns", () => {
    const seen = new Map<string, string>();
    for (const entry of UK_MERCHANTS) {
      if (seen.has(entry.pattern)) {
        throw new Error(
          `Duplicate pattern "${entry.pattern}" (${seen.get(entry.pattern)} vs ${entry.category})`,
        );
      }
      seen.set(entry.pattern, entry.category);
    }
    expect(seen.size).toBe(UK_MERCHANTS.length);
  });
});

describe("normalizeDescription — rule classes", () => {
  it("uppercases, collapses whitespace, trims", () => {
    expect(normalizeDescription("  tesco   stores  ")).toBe("TESCO STORES");
  });

  it("strips a single leading * card glyph", () => {
    expect(normalizeDescription("*GREGGS LEEDS")).toBe("GREGGS LEEDS");
  });

  it("strips a single leading bank txn-type prefix", () => {
    expect(normalizeDescription("CARD PAYMENT TO TESCO STORES")).toBe(
      "TESCO STORES",
    );
  });

  it("strips multiple stacked leading prefixes in sequence", () => {
    // "VIS" then "CONTACTLESS" both leading
    expect(normalizeDescription("VIS CONTACTLESS COSTA COFFEE")).toBe(
      "COSTA COFFEE",
    );
  });

  it("strips abbreviation prefixes DD / SO / S/O / BGC / FPI", () => {
    expect(normalizeDescription("DD BRITISH GAS")).toBe("BRITISH GAS");
    expect(normalizeDescription("SO RENT PAYMENT")).toBe("RENT PAYMENT");
    expect(normalizeDescription("S/O LANDLORD")).toBe("LANDLORD");
    expect(normalizeDescription("BGC SALARY")).toBe("SALARY");
    expect(normalizeDescription("FPI ACME LTD")).toBe("ACME LTD");
  });

  it("does NOT strip a prefix token that is part of a longer word", () => {
    // "SOHO" begins with "SO" but is one token — must not be truncated.
    // (trailing 2-letter tokens like "CO" WOULD be stripped, so end with a
    // longer word to isolate the prefix-boundary behaviour.)
    expect(normalizeDescription("SOHO COFFEE HOUSE")).toBe("SOHO COFFEE HOUSE");
  });

  it("strips PayPal / Square / SumUp / Zettle / iZettle / Google aggregator prefixes", () => {
    expect(normalizeDescription("PAYPAL *NETFLIX")).toBe("NETFLIX");
    expect(normalizeDescription("PAYPAL*SPOTIFY")).toBe("SPOTIFY");
    expect(normalizeDescription("SQ *THE COFFEE BAR")).toBe("THE COFFEE BAR");
    expect(normalizeDescription("SUMUP *MARKET STALL")).toBe("MARKET STALL");
    expect(normalizeDescription("ZTL*DELI")).toBe("DELI");
    expect(normalizeDescription("IZ *FARM SHOP")).toBe("FARM SHOP");
    expect(normalizeDescription("GOOGLE *YOUTUBEPREMIUM")).toBe(
      "YOUTUBEPREMIUM",
    );
  });

  it("strips REF references and 6+ digit runs", () => {
    expect(normalizeDescription("BRITISH GAS REF 778899001")).toBe(
      "BRITISH GAS",
    );
    expect(normalizeDescription("NETFLIX.COM 35314369001")).toBe("NETFLIX.COM");
    // 4-digit store number is kept (not a 6+ run)
    expect(normalizeDescription("TESCO STORES 2345")).toBe("TESCO STORES 2345");
  });

  it("strips card masks", () => {
    expect(normalizeDescription("SHELL 1234********5678")).toBe("SHELL");
    expect(normalizeDescription("ESSO XXXX1234")).toBe("ESSO");
  });

  it("strips embedded numeric and worded dates", () => {
    expect(normalizeDescription("TESCO 12-05-2026")).toBe("TESCO");
    expect(normalizeDescription("TESCO 12/05/26")).toBe("TESCO");
    expect(normalizeDescription("TESCO ON 12 MAY 2026")).toBe("TESCO");
    expect(normalizeDescription("TESCO 12MAY26")).toBe("TESCO");
  });

  it("strips times", () => {
    expect(normalizeDescription("UBER TRIP 23:41")).toBe("UBER TRIP");
    expect(normalizeDescription("UBER TRIP 23:41:09")).toBe("UBER TRIP");
  });

  it("strips FX rate noise", () => {
    expect(normalizeDescription("STARBUCKS 12.00 EUR @ 1.17")).toBe(
      "STARBUCKS",
    );
    expect(normalizeDescription("STARBUCKS RATE 1.17")).toBe("STARBUCKS");
  });

  it("strips trailing country / location tokens GB GBR UK GBP and 2-letter codes", () => {
    expect(normalizeDescription("GREGGS LEEDS GB")).toBe("GREGGS LEEDS");
    expect(normalizeDescription("ALDI MANCHESTER GBR")).toBe("ALDI MANCHESTER");
    expect(normalizeDescription("ASOS UK")).toBe("ASOS");
    expect(normalizeDescription("AMZN MKTP UK")).toBe("AMZN MKTP");
  });

  it("strips punctuation noise but keeps & ' - inside names", () => {
    expect(normalizeDescription("MARKS & SPENCER")).toBe("MARKS & SPENCER");
    expect(normalizeDescription("SAINSBURY'S LOCAL")).toBe("SAINSBURY'S LOCAL");
    expect(normalizeDescription("FAT-FACE STORE")).toBe("FAT-FACE STORE");
    expect(normalizeDescription("TESCO,, STORES##")).toBe("TESCO STORES");
  });

  it("returns empty string for empty / whitespace input", () => {
    expect(normalizeDescription("")).toBe("");
    expect(normalizeDescription("   ")).toBe("");
  });
});

describe("displayMerchant", () => {
  it("title-cases the leading name run, dropping trailing numbers", () => {
    expect(displayMerchant("CARD PAYMENT TO TESCO STORES 2345")).toBe(
      "Tesco Stores",
    );
  });

  it("keeps short all-caps brand tokens uppercase", () => {
    // NB: trailing 2-letter token "CH" is stripped by the country-code rule, so
    // "TFL TRAVEL CH" normalises to "TFL TRAVEL".
    expect(displayMerchant("TFL TRAVEL CH")).toBe("TFL Travel");
    expect(displayMerchant("KFC LEEDS")).toBe("KFC Leeds");
    expect(displayMerchant("BP CONNECT")).toBe("BP Connect");
  });

  it("handles aggregator-prefixed merchants", () => {
    // "." is not treated as a name-part separator, so "NETFLIX.COM" lower-cases
    // to "Netflix.com" (leading letter of the token capitalised only).
    expect(displayMerchant("PAYPAL *NETFLIX.COM 35314369001")).toBe(
      "Netflix.com",
    );
  });

  it("title-cases connector-joined names", () => {
    expect(displayMerchant("FRANKIE & BENNY 88")).toBe("Frankie & Benny");
  });

  it("returns empty for empty input", () => {
    expect(displayMerchant("")).toBe("");
  });
});

describe("categorize — realistic raw bank strings (no user rules)", () => {
  const cases: { raw: string; expected: string }[] = [
    { raw: "CARD PAYMENT TO TESCO STORES 2345 ON 12-05-2026", expected: "Groceries" },
    { raw: "DD BRITISH GAS REF 778899001", expected: "Utilities" },
    { raw: "PAYPAL *NETFLIX.COM 35314369001", expected: "Subscriptions" },
    { raw: "*GREGGS LEEDS GB", expected: "Coffee & Snacks" },
    { raw: "TFL TRAVEL CH TFL.GOV.UK/CP", expected: "Transport" },
    { raw: "UBER EATS PENDING", expected: "Eating Out" },
    { raw: "UBER *TRIP HELP.UBER.COM", expected: "Transport" },
    { raw: "TESCO PETROL 4453 LEEDS", expected: "Fuel" },
    { raw: "FASTER PAYMENT RECEIVED SALARY ACME LTD", expected: "Salary" },
    { raw: "TRANSFER TO SAVINGS POT", expected: "Transfers" },
    { raw: "REPAYMENT FROM SUKRITI KAUSHIK", expected: "Transfers" },
    { raw: "Fruity Fresh", expected: "Groceries" },
    { raw: "NITA CASH AND CARRY", expected: "Groceries" },
    { raw: "Ganapathy Cash & Carry", expected: "Groceries" },
    { raw: "Fudco", expected: "Groceries" },
    { raw: "Diesel", expected: "Shopping" },
    { raw: "AMAZON PRIME*AB12C", expected: "Subscriptions" },
    { raw: "AMZN MKTP UK", expected: "Shopping" },
  ];

  for (const c of cases) {
    it(`"${c.raw}" → ${c.expected}`, () => {
      const result = categorize(c.raw, []);
      expect(result.categoryName).toBe(c.expected);
      expect(result.source).toBe("builtin");
      expect(result.matchedPattern).not.toBeNull();
    });
  }

  it("returns an all-null result for an unknown merchant", () => {
    const result = categorize("ZZZ MYSTERY VENDOR XYZ", []);
    expect(result).toEqual({
      categoryName: null,
      matchedPattern: null,
      source: null,
    });
  });

  it("returns all-null for empty description", () => {
    expect(categorize("", [])).toEqual({
      categoryName: null,
      matchedPattern: null,
      source: null,
    });
  });
});

describe("categorize — longest-pattern-first precedence", () => {
  it("UBER EATS (Eating Out) beats UBER (Transport)", () => {
    expect(categorize("UBER EATS LONDON", []).categoryName).toBe("Eating Out");
    expect(categorize("UBER TRIP LONDON", []).categoryName).toBe("Transport");
  });

  it("TESCO PETROL (Fuel) beats TESCO (Groceries)", () => {
    expect(categorize("TESCO PETROL 4453", []).categoryName).toBe("Fuel");
    expect(categorize("TESCO STORES 4453", []).categoryName).toBe("Groceries");
  });

  it("TESCO MOBILE (Phone & Internet) beats TESCO (Groceries)", () => {
    expect(categorize("TESCO MOBILE TOPUP", []).categoryName).toBe(
      "Phone & Internet",
    );
  });

  it("AMAZON PRIME (Subscriptions) beats AMAZON (Shopping)", () => {
    expect(categorize("AMAZON PRIME MEMBERSHIP", []).categoryName).toBe(
      "Subscriptions",
    );
    expect(categorize("AMAZON MKTP", []).categoryName).toBe("Shopping");
  });

  it("APPLE.COM/BILL (Subscriptions) beats a plain Apple shopping reference", () => {
    expect(categorize("APPLE.COM/BILL ITUNES", []).categoryName).toBe(
      "Subscriptions",
    );
  });

  it("M&S SIMPLY FOOD (Groceries) beats M&S (Clothing)", () => {
    expect(categorize("M&S SIMPLY FOOD CAMDEN", []).categoryName).toBe(
      "Groceries",
    );
    expect(categorize("M&S OXFORD ST", []).categoryName).toBe("Clothing");
  });

  it("SAINSBURYS PETROL (Fuel) beats SAINSBURY (Groceries)", () => {
    expect(categorize("SAINSBURYS PETROL HOLLOWAY", []).categoryName).toBe(
      "Fuel",
    );
  });

  it("SKY MOBILE → Phone & Internet", () => {
    expect(categorize("SKY MOBILE PAYMENT", []).categoryName).toBe(
      "Phone & Internet",
    );
  });
});

describe("categorize — user rules", () => {
  it("a user rule overrides a builtin for the same merchant (equal length tie → user wins)", () => {
    // "TESCO" builtin → Groceries, but user maps "TESCO" → Shopping.
    const rules: UserRule[] = [{ pattern: "TESCO", categoryName: "Shopping" }];
    const result = categorize("TESCO STORES", rules);
    // Note "TESCO STORES" (builtin, longer) would otherwise win; here the user
    // rule "TESCO" is shorter so the longer builtin still wins. Use a string
    // that only the bare TESCO matches to test the tie cleanly:
    const tie = categorize("TESCO XYZ", rules);
    expect(tie.categoryName).toBe("Shopping");
    expect(tie.source).toBe("rule");
    // sanity: the longer builtin still beats the shorter user rule
    expect(result.categoryName).toBe("Groceries");
  });

  it("a user rule wins a length tie against an equal-length builtin", () => {
    // Builtin "ALDI" (4) → Groceries; user "ALDI" (4) → Shopping. Tie → user.
    const rules: UserRule[] = [{ pattern: "ALDI", categoryName: "Shopping" }];
    const result = categorize("ALDI MANCHESTER", rules);
    expect(result.categoryName).toBe("Shopping");
    expect(result.source).toBe("rule");
  });

  it("a longer user rule beats a shorter builtin", () => {
    const rules: UserRule[] = [
      { pattern: "TESCO STORES", categoryName: "Shopping" },
    ];
    const result = categorize("TESCO STORES LEEDS", rules);
    expect(result.categoryName).toBe("Shopping");
    expect(result.source).toBe("rule");
  });

  it("a longer builtin beats a shorter user rule (pure length ordering)", () => {
    // user "UBER" (4) → Personal Care, but builtin "UBER EATS" (9) is longer.
    const rules: UserRule[] = [{ pattern: "UBER", categoryName: "Personal Care" }];
    const result = categorize("UBER EATS LONDON", rules);
    expect(result.categoryName).toBe("Eating Out");
    expect(result.source).toBe("builtin");
  });

  it("matches a user rule against the NORMALISED description", () => {
    const rules: UserRule[] = [
      { pattern: "MY LANDLORD", categoryName: "Rent & Mortgage" },
    ];
    const result = categorize("SO MY LANDLORD REF 123456789", rules);
    expect(result.categoryName).toBe("Rent & Mortgage");
    expect(result.source).toBe("rule");
    expect(result.matchedPattern).toBe("MY LANDLORD");
  });

  it("lower-cased user-rule patterns are upper-cased before matching", () => {
    const rules: UserRule[] = [{ pattern: "acme gym", categoryName: "Health & Pharmacy" }];
    const result = categorize("ACME GYM MONTHLY", rules);
    expect(result.categoryName).toBe("Health & Pharmacy");
    expect(result.matchedPattern).toBe("ACME GYM");
  });

  it("ignores empty user-rule patterns", () => {
    const rules: UserRule[] = [{ pattern: "", categoryName: "Shopping" }];
    const result = categorize("UNKNOWN VENDOR ZZZ", rules);
    expect(result.categoryName).toBeNull();
  });
});

describe("categorize — additional category smoke coverage", () => {
  const samples: { raw: string; expected: string }[] = [
    { raw: "CARD PAYMENT TO ALDI 88 LEEDS", expected: "Groceries" },
    { raw: "COSTA COFFEE MANCHESTER", expected: "Coffee & Snacks" },
    { raw: "DELIVEROO ORDER 998877", expected: "Eating Out" },
    { raw: "TRAINLINE.COM", expected: "Transport" },
    { raw: "SHELL 1234********5678", expected: "Fuel" },
    { raw: "ARGOS RETAIL", expected: "Shopping" },
    { raw: "PRIMARK STORES", expected: "Clothing" },
    { raw: "BOOTS THE CHEMIST", expected: "Health & Pharmacy" },
    { raw: "ODEON CINEMA", expected: "Entertainment" },
    { raw: "SPOTIFY P1A2B3C", expected: "Subscriptions" },
    { raw: "OCTOPUS ENERGY LTD", expected: "Utilities" },
    { raw: "LEEDS CITY COUNCIL TAX", expected: "Council Tax" },
    { raw: "VODAFONE LTD", expected: "Phone & Internet" },
    { raw: "B&Q 1234 LEEDS", expected: "Home & DIY" },
    { raw: "PETS AT HOME LEEDS", expected: "Pets" },
    { raw: "RYANAIR FLIGHT", expected: "Travel & Holidays" },
    { raw: "JUSTGIVING DONATION", expected: "Charity" },
    { raw: "CASH WITHDRAWAL LINK ATM", expected: "Cash Withdrawal" },
    { raw: "ARRANGED OVERDRAFT FEE", expected: "Fees & Charges" },
    { raw: "VANGUARD INVESTOR", expected: "Savings & Investments" },
    { raw: "HMRC REPAYMENT", expected: "Other Income" },
  ];

  for (const s of samples) {
    it(`"${s.raw}" → ${s.expected}`, () => {
      expect(categorize(s.raw, []).categoryName).toBe(s.expected);
    });
  }
});
