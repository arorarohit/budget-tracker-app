# Agent Guidelines for Claude Budget Tracker

A personal finance and expense tracker for the UK built with Next.js 14 App Router, Prisma, SQLite, Tailwind CSS, and Vitest.

## Quick Reference & Commands

- **Dev Server**: `npm run dev`
- **Build**: `npm run build`
- **Type Check**: `npm run typecheck` (`tsc --noEmit`)
- **Unit Tests**: `npm run test` (`vitest run`)
- **Database Push**: `npm run db:push` (`prisma db push`)
- **Database Seed**: `npm run db:seed` (`tsx prisma/seed.ts`)

## Core Architecture & Conventions

Detailed TypeScript contracts and module specifications are defined in [`lib/types.ts`](lib/types.ts). Follow these project rules strictly:

### 1. Money Representation
- Money is **ALWAYS** an integer representing pence (`amountPence`). Never use floating-point numbers for currency amounts.
- Convention: **Negative = money out (expenses/spend)**, **Positive = money in (income/refunds)**.
- Normalise at parse/import time regardless of the bank's individual export conventions (e.g. Amex exports spend as positive, so invert at import).

### 2. Dates & Formatting
- All transaction dates in DTOs and database queries use ISO strings (`yyyy-MM-dd`).
- Monthly periods use `yyyy-MM`.
- Currency formatting utilities reside in [`lib/format.ts`](lib/format.ts).

### 3. Categorisation Rules
- Categories have a `type`: `"expense" | "income" | "transfer"`.
- Transactions tagged with `"transfer"` categories are **excluded** from spend, income, and budget calculations in `/api/stats`.
- `Transaction.categorySource`: `"none" | "builtin" | "rule" | "manual"`.
- **CRITICAL**: `"manual"` category assignments must **never** be overwritten by automated rules, re-imports, or batch rule applications.

### 4. Statement Parsing & Imports
- Parsers reside in [`lib/parsers/`](lib/parsers/).
- Handle bank-specific nuances (Nationwide preambles, headerless HSBC 3-column files, Monzo formats).
- Deduplication is content-based via `importHash` (`"<contentHash>:<dupSeq>"` in [`lib/import-hash.ts`](lib/import-hash.ts)).
