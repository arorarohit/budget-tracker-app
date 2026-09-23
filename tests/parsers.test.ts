import { describe, it, expect } from "vitest";
import { parseCsv, parseAmountToPence, PRESETS } from "@/lib/parsers";
import { parseChasePdfText, parseGenericPdfLines } from "@/lib/parsers/pdf";
import type { ColumnMapping } from "@/lib/types";

// ---------------------------------------------------------------------------
// parseAmountToPence edge cases
// ---------------------------------------------------------------------------
describe("parseAmountToPence", () => {
  it("parses plain decimals to pence", () => {
    expect(parseAmountToPence("12.34")).toBe(1234);
    expect(parseAmountToPence("0.29")).toBe(29);
    expect(parseAmountToPence("100")).toBe(10000);
  });

  describe("generic PDF transaction extraction", () => {
    it("parses Barclays-style date, description and amount rows", () => {
      const rows = parseGenericPdfLines([
        "Barclaycard Credit Card Statement",
        "01/08/2026 TESCO STORES £42.17",
        "03/08/2026 PAYMENT RECEIVED £100.00",
      ], { invertPositiveAmounts: true });

      expect(rows).toEqual([
        { date: "2026-08-01", description: "TESCO STORES", amountPence: -4217 },
        { date: "2026-08-03", description: "PAYMENT RECEIVED", amountPence: 10000 },
      ]);
    });

    it("joins a date/description line to an amount-only line", () => {
      const rows = parseGenericPdfLines([
        "Statement period 01 Aug 2026 to 31 Aug 2026",
        "12 Aug 2026 AMAZON MARKETPLACE",
        "£12.99",
      ], { invertPositiveAmounts: true });

      expect(rows).toEqual([
        { date: "2026-08-12", description: "AMAZON MARKETPLACE", amountPence: -1299 },
      ]);
    });

    it("keeps explicit CR/DR signs authoritative", () => {
      const rows = parseGenericPdfLines([
        "20/08/2026 REFUND £25.00 CR",
        "21/08/2026 PURCHASE £10.00 DR",
      ], { invertPositiveAmounts: true });

      expect(rows.map((row) => row.amountPence)).toEqual([2500, -1000]);
    });

    it("does not import first-page credit-card summary fields", () => {
      const rows = parseGenericPdfLines([
        "Your credit card statement",
        "Statement date: 03 Sep 2026",
        "Statement period: 03 Aug 2026 - 02 Sep 2026",
        "Available credit: £4,537.28",
        "Credit limit: £5,100.00",
        "Minimum payment Due 27 Sep 2026 £15.00",
        "Statement balance: £562.72",
        "02 Sep 2026 TESCO STORES £42.17",
      ], { invertPositiveAmounts: true });

      expect(rows).toEqual([
        { date: "2026-09-02", description: "TESCO STORES", amountPence: -4217 },
      ]);
    });

    it("excludes closing balance and keeps repayments as positive money in", () => {
      const rows = parseGenericPdfLines([
        "27 Aug 2026 From Sukriti Kaushik",
        "Repayment",
        "+£1,163.89",
        "03 Sep 2026 Closing balance £562.72",
      ], { invertPositiveAmounts: true });

      expect(rows).toEqual([
        {
          date: "2026-08-27",
          description: "From Sukriti Kaushik Repayment",
          amountPence: 116389,
        },
      ]);
    });

    it("filters closing balance in the Chase-specific parser", () => {
      const rows = parseChasePdfText([
        "27 Aug 2026 From Sukriti Kaushik Repayment +£1,163.89",
        "03 Sep 2026 Closing balance £562.72",
      ]);

      expect(rows).toEqual([
        {
          date: "2026-08-27",
          description: "From Sukriti Kaushik Repayment",
          amountPence: 116389,
        },
      ]);
    });

    it("does not attach a repayment marker to a later purchase", () => {
      const rows = parseGenericPdfLines(
        [
          "27 Aug 2026 From Sukriti Kaushik +£1,163.89",
          "Repayment",
          "01 Sep 2026 Ganapathy Cash & Carry £11.28",
        ],
        { invertPositiveAmounts: true },
      );

      expect(rows).toEqual([
        {
          date: "2026-08-27",
          description: "From Sukriti Kaushik Repayment",
          amountPence: 116389,
        },
        {
          date: "2026-09-01",
          description: "Ganapathy Cash & Carry",
          amountPence: -1128,
        },
      ]);
    });
  });

  it("strips £, commas and surrounding whitespace", () => {
    expect(parseAmountToPence("£1,234.56")).toBe(123456);
    expect(parseAmountToPence("  £ 42.17 ")).toBe(4217);
    expect(parseAmountToPence("£12")).toBe(1200);
  });

  it("treats parentheses as negative", () => {
    expect(parseAmountToPence("(12.34)")).toBe(-1234);
    expect(parseAmountToPence("(£1,000.00)")).toBe(-100000);
  });

  it("treats trailing DR as negative and CR as positive", () => {
    expect(parseAmountToPence("12.34 DR")).toBe(-1234);
    expect(parseAmountToPence("12.34 CR")).toBe(1234);
    expect(parseAmountToPence("50.00DR")).toBe(-5000);
    expect(parseAmountToPence("50.00CR")).toBe(5000);
  });

  it("honours an explicit leading sign", () => {
    expect(parseAmountToPence("-9.99")).toBe(-999);
    expect(parseAmountToPence("+9.99")).toBe(999);
  });

  it("avoids float drift", () => {
    expect(parseAmountToPence("19.99")).toBe(1999);
    expect(parseAmountToPence("0.07")).toBe(7);
  });

  it("returns null for garbage and empty input", () => {
    expect(parseAmountToPence("garbage")).toBeNull();
    expect(parseAmountToPence("")).toBeNull();
    expect(parseAmountToPence("   ")).toBeNull();
    expect(parseAmountToPence("£")).toBeNull();
    expect(parseAmountToPence("-")).toBeNull();
    expect(parseAmountToPence(null)).toBeNull();
    expect(parseAmountToPence(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Monzo
// ---------------------------------------------------------------------------
describe("Monzo preset", () => {
  const csv = String.raw`Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In
tx_1,03/04/2026,12:31:55,Card payment,Tesco,🛒,Groceries,-42.17,GBP,-42.17,GBP,,Tesco Express,,TESCO STORES 2345,,42.17,
tx_2,05/04/2026,00:00:01,Faster payment,Acme Payroll,💰,Income,2450.00,GBP,2450.00,GBP,April salary,,,ACME PAYROLL SALARY,,,2450.00
tx_3,07/04/2026,19:45:30,Card payment,,🎬,Entertainment,-10.99,GBP,-10.99,GBP,,,,NETFLIX.COM,,10.99,`;

  it("auto-detects and parses signed amounts with Name as description", () => {
    const res = parseCsv(csv);
    expect(res.presetId).toBe("monzo");
    expect(res.rows).toHaveLength(3);
    expect(res.rows[0]).toEqual({ date: "2026-04-03", description: "Tesco", amountPence: -4217 });
    expect(res.rows[1]).toEqual({ date: "2026-04-05", description: "Acme Payroll", amountPence: 245000 });
  });

  it("falls back to Description when Name is blank", () => {
    const res = parseCsv(csv);
    expect(res.rows[2].description).toBe("NETFLIX.COM");
    expect(res.rows[2].amountPence).toBe(-1099);
  });
});

// ---------------------------------------------------------------------------
// Starling
// ---------------------------------------------------------------------------
describe("Starling preset", () => {
  const csv = String.raw`Date,Counter Party,Reference,Type,Amount (GBP),Balance (GBP)
04/04/2026,Tesco Stores,Card Payment,Card,-31.20,968.80
06/04/2026,Acme Ltd,April Salary,Faster Payment,2200.00,3168.80
08/04/2026,Greggs,,Card,-2.95,3165.85`;

  it("detects via counter party and builds description with reference", () => {
    const res = parseCsv(csv);
    expect(res.presetId).toBe("starling");
    expect(res.rows[0]).toEqual({
      date: "2026-04-04",
      description: "Tesco Stores (Card Payment)",
      amountPence: -3120,
    });
    expect(res.rows[1].description).toBe("Acme Ltd (April Salary)");
    expect(res.rows[1].amountPence).toBe(220000);
  });

  it("omits the reference parens when reference is blank", () => {
    const res = parseCsv(csv);
    expect(res.rows[2].description).toBe("Greggs");
  });
});

// ---------------------------------------------------------------------------
// Barclays
// ---------------------------------------------------------------------------
describe("Barclays preset", () => {
  const csv = String.raw`Number,Date,Account,Amount,Subcategory,Memo
1,05/04/2026,20-11-22 12345678,-18.40,Groceries,SAINSBURYS SMKT BARNET
2,07/04/2026,20-11-22 12345678,1500.00,Salary,ACME LTD PAYROLL
3,09/04/2026,20-11-22 12345678,-9.99,Subscriptions,SPOTIFY UK`;

  it("detects via subcategory+memo and uses Memo as description", () => {
    const res = parseCsv(csv);
    expect(res.presetId).toBe("barclays");
    expect(res.rows[0]).toEqual({
      date: "2026-04-05",
      description: "SAINSBURYS SMKT BARNET",
      amountPence: -1840,
    });
    expect(res.rows[1].amountPence).toBe(150000);
    expect(res.rows[2].amountPence).toBe(-999);
  });
});

// ---------------------------------------------------------------------------
// Lloyds — split debit/credit
// ---------------------------------------------------------------------------
describe("Lloyds preset", () => {
  const csv = String.raw`Transaction Date,Transaction Type,Sort Code,Account Number,Transaction Description,Debit Amount,Credit Amount,Balance
02/04/2026,DEB,30-99-12,12345678,TESCO STORES 3411 LEEDS,38.92,,1461.08
07/04/2026,FPI,30-99-12,12345678,ACME LTD SALARY APR,,2380.55,3841.63
14/04/2026,SO,30-99-12,12345678,TRANSFER TO SAVINGS,250.00,,3591.63`;

  it("makes debit negative and credit positive", () => {
    const res = parseCsv(csv);
    expect(res.presetId).toBe("lloyds");
    expect(res.rows[0]).toEqual({
      date: "2026-04-02",
      description: "TESCO STORES 3411 LEEDS",
      amountPence: -3892,
    });
    expect(res.rows[1].amountPence).toBe(238055);
    expect(res.rows[2].amountPence).toBe(-25000);
  });
});

// ---------------------------------------------------------------------------
// NatWest — quote stripping + trailing empty column tolerance
// ---------------------------------------------------------------------------
describe("NatWest preset", () => {
  const csv = String.raw`Date,Type,Description,Value,Balance,Account Name,Account Number,
04/04/2026,POS,'TESCO STORES 4471 LONDON',-44.21,1455.79,'MR J SMITH','12345678',
06/04/2026,BAC,'ACME LTD SALARY',2300.00,3755.79,'MR J SMITH','12345678',
09/04/2026,DD,'NETFLIX.COM',-10.99,3744.80,'MR J SMITH','12345678',`;

  it("strips leading/trailing apostrophes from descriptions and tolerates trailing column", () => {
    const res = parseCsv(csv);
    expect(res.presetId).toBe("natwest");
    expect(res.rows[0]).toEqual({
      date: "2026-04-04",
      description: "TESCO STORES 4471 LONDON",
      amountPence: -4421,
    });
    expect(res.rows[1].description).toBe("ACME LTD SALARY");
    expect(res.rows[1].amountPence).toBe(230000);
    expect(res.rows[2].description).toBe("NETFLIX.COM");
  });
});

// ---------------------------------------------------------------------------
// Nationwide — preamble, £ stripping, both date variants, split paid out/in
// ---------------------------------------------------------------------------
describe("Nationwide preset", () => {
  const csv = String.raw`Account Name:,FlexAccount
Account Balance:,£2104.66
Available Balance:,£2104.66
Date,Transaction type,Description,Paid out,Paid in,Balance
05 Apr 2026,Direct debit,British Gas Energy,£74.20,,£1925.80
10 Apr 2026,Bank credit,Acme Ltd Salary,,£2310.00,£4235.80
29-Apr-26,Visa purchase,Amazon Co Uk,£19.99,,£4215.81`;

  it("skips preamble lines and locates the real header", () => {
    const res = parseCsv(csv);
    expect(res.presetId).toBe("nationwide");
    expect(res.headers[0]).toBe("Date");
    expect(res.rows).toHaveLength(3);
  });

  it("strips £ and applies split paid out (negative) / paid in (positive)", () => {
    const res = parseCsv(csv);
    expect(res.rows[0]).toEqual({
      date: "2026-04-05",
      description: "British Gas Energy",
      amountPence: -7420,
    });
    expect(res.rows[1].amountPence).toBe(231000);
  });

  it("handles both 'DD Mon YYYY' and 'DD-Mon-YY' date variants", () => {
    const res = parseCsv(csv);
    expect(res.rows[0].date).toBe("2026-04-05");
    expect(res.rows[2].date).toBe("2026-04-29");
    expect(res.rows[2].amountPence).toBe(-1999);
  });
});

// ---------------------------------------------------------------------------
// HSBC — headerless structural detection via auto-detect
// ---------------------------------------------------------------------------
describe("HSBC preset", () => {
  const csv = String.raw`04/04/2026,TESCO STORES 4471 LONDON,-44.21
09/04/2026,ACME LTD SALARY APRIL,2520.18
11/04/2026,NETFLIX.COM,-10.99`;

  it("auto-detects a headerless 3-column file and uses synthetic col headers", () => {
    const res = parseCsv(csv);
    expect(res.presetId).toBe("hsbc");
    expect(res.headers).toEqual(["col0", "col1", "col2"]);
    expect(res.rows).toHaveLength(3);
    expect(res.rows[0]).toEqual({
      date: "2026-04-04",
      description: "TESCO STORES 4471 LONDON",
      amountPence: -4421,
    });
    expect(res.rows[1].amountPence).toBe(252018);
    expect(res.rows[2].amountPence).toBe(-1099);
  });
});

// ---------------------------------------------------------------------------
// Revolut — fee subtraction + COMPLETED/GBP filtering
// ---------------------------------------------------------------------------
describe("Revolut preset", () => {
  const csv = String.raw`Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
CARD_PAYMENT,Current,2026-04-04 09:00:00,2026-04-04 09:00:05,Tesco,-30.00,0.00,GBP,COMPLETED,470.00
TOPUP,Current,2026-04-05 08:00:00,2026-04-05 08:00:10,Apple Pay Top-Up,100.00,1.50,GBP,COMPLETED,570.00
CARD_PAYMENT,Current,2026-04-06 10:00:00,2026-04-06 10:00:00,Pending Coffee,-3.50,0.00,GBP,PENDING,566.50
CARD_PAYMENT,Current,2026-04-07 11:00:00,2026-04-07 11:00:00,New York Diner,-25.00,0.00,USD,COMPLETED,541.50
CARD_PAYMENT,Current,2026-04-08 12:00:00,,Greggs Fallback Date,-2.95,0.00,GBP,COMPLETED,538.55`;

  it("subtracts the fee from the amount", () => {
    const res = parseCsv(csv);
    expect(res.presetId).toBe("revolut");
    // 100.00 topup minus 1.50 fee = 98.50
    const topup = res.rows.find((r) => r.description === "Apple Pay Top-Up");
    expect(topup?.amountPence).toBe(9850);
  });

  it("skips non-COMPLETED and non-GBP rows", () => {
    const res = parseCsv(csv);
    const descriptions = res.rows.map((r) => r.description);
    expect(descriptions).not.toContain("Pending Coffee");
    expect(descriptions).not.toContain("New York Diner");
    expect(res.rows).toHaveLength(3);
  });

  it("falls back to Started Date when Completed Date is blank", () => {
    const res = parseCsv(csv);
    const fallback = res.rows.find((r) => r.description === "Greggs Fallback Date");
    expect(fallback?.date).toBe("2026-04-08");
  });
});

// ---------------------------------------------------------------------------
// Amex — sign inversion, detected last
// ---------------------------------------------------------------------------
describe("Amex preset", () => {
  const csv = String.raw`Date,Description,Amount,Extended Details,Appears On Your Statement As
05/04/2026,TESCO STORES LONDON,42.17,Groceries,TESCO
07/04/2026,AMAZON UK,23.49,Online,AMAZON
09/04/2026,PAYMENT RECEIVED - THANK YOU,-150.00,Payment,PAYMENT`;

  it("inverts the sign so spend is negative", () => {
    const res = parseCsv(csv);
    expect(res.presetId).toBe("amex");
    expect(res.rows[0]).toEqual({
      date: "2026-04-05",
      description: "TESCO STORES LONDON",
      amountPence: -4217,
    });
    expect(res.rows[1].amountPence).toBe(-2349);
    // A payment (negative in the export) becomes a positive credit.
    expect(res.rows[2].amountPence).toBe(15000);
  });
});

// ---------------------------------------------------------------------------
// Generic column mapper
// ---------------------------------------------------------------------------
describe("Generic column mapper", () => {
  it("parses a single signed amount column (dmy)", () => {
    const csv = String.raw`When,What,Value
03/04/2026,Corner Shop,-5.50
05/04/2026,Refund,12.00`;
    const mapping: ColumnMapping = {
      dateColumn: "When",
      descriptionColumn: "What",
      amountColumn: "Value",
      dateFormat: "dmy",
    };
    const res = parseCsv(csv, { mapping });
    expect(res.presetId).toBe("generic");
    expect(res.rows[0]).toEqual({ date: "2026-04-03", description: "Corner Shop", amountPence: -550 });
    expect(res.rows[1].amountPence).toBe(1200);
  });

  it("parses split debit/credit columns", () => {
    const csv = String.raw`Date,Detail,Out,In
2026-04-03,Tesco,40.00,
2026-04-05,Salary,,2000.00`;
    const mapping: ColumnMapping = {
      dateColumn: "Date",
      descriptionColumn: "Detail",
      debitColumn: "Out",
      creditColumn: "In",
      dateFormat: "ymd",
    };
    const res = parseCsv(csv, { mapping });
    expect(res.rows[0].amountPence).toBe(-4000);
    expect(res.rows[1].amountPence).toBe(200000);
  });

  it("applies invertAmount for credit-card style exports", () => {
    const csv = String.raw`Date,Merchant,Charge
04/05/2026,Shop,9.99`;
    const mapping: ColumnMapping = {
      dateColumn: "Date",
      descriptionColumn: "Merchant",
      amountColumn: "Charge",
      dateFormat: "dmy",
      invertAmount: true,
    };
    const res = parseCsv(csv, { mapping });
    expect(res.rows[0].amountPence).toBe(-999);
  });

  it("handles the mdy date format", () => {
    const csv = String.raw`Date,Desc,Amt
04/30/2026,US Vendor,-7.25`;
    const mapping: ColumnMapping = {
      dateColumn: "Date",
      descriptionColumn: "Desc",
      amountColumn: "Amt",
      dateFormat: "mdy",
    };
    const res = parseCsv(csv, { mapping });
    expect(res.rows[0].date).toBe("2026-04-30");
    expect(res.rows[0].amountPence).toBe(-725);
  });
});

// ---------------------------------------------------------------------------
// Bad rows and unknown files
// ---------------------------------------------------------------------------
describe("error handling", () => {
  it("skips rows with invalid calendar dates and warns", () => {
    const csv = String.raw`Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In
tx_1,32/13/2026,00:00:00,Card payment,Bad Date,❌,X,-1.00,GBP,-1.00,GBP,,,,BAD,,1.00,
tx_2,03/04/2026,12:00:00,Card payment,Good,✅,X,-2.00,GBP,-2.00,GBP,,,,GOOD,,2.00,`;
    const res = parseCsv(csv);
    expect(res.presetId).toBe("monzo");
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].description).toBe("Good");
    expect(res.warnings.some((w) => w.toLowerCase().includes("skipped"))).toBe(true);
  });

  it("returns presetId 'unknown' with headers populated for undetected files", () => {
    const csv = String.raw`Widget,Gizmo,Doohickey
foo,bar,baz
qux,quux,corge`;
    const res = parseCsv(csv);
    expect(res.presetId).toBe("unknown");
    expect(res.rows).toEqual([]);
    expect(res.headers).toEqual(["Widget", "Gizmo", "Doohickey"]);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it("returns 'unknown' for an empty file", () => {
    const res = parseCsv("");
    expect(res.presetId).toBe("unknown");
    expect(res.rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Explicit presetId
// ---------------------------------------------------------------------------
describe("explicit presetId", () => {
  it("uses the given preset and still skips Nationwide preamble", () => {
    const csv = String.raw`Account Name:,FlexAccount
Account Balance:,£100.00
Date,Transaction type,Description,Paid out,Paid in,Balance
05 Apr 2026,Direct debit,British Gas,£74.20,,£25.80`;
    const res = parseCsv(csv, { presetId: "nationwide" });
    expect(res.presetId).toBe("nationwide");
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].amountPence).toBe(-7420);
  });

  it("exposes all presets via PRESETS in detection order (amex last)", () => {
    const ids = PRESETS.map((p) => p.id);
    expect(ids).toContain("monzo");
    expect(ids).toContain("hsbc");
    expect(ids[ids.length - 1]).toBe("amex");
  });
});
