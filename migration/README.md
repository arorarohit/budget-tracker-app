# Local data migration

These scripts preserve the existing SQLite data before moving to Supabase/PostgreSQL.

## Export

Run locally while the old SQLite database exists:

```powershell
npm run migration:export
```

Optional variables:

```powershell
$env:SQLITE_DATABASE_PATH = "C:\path\to\dev.db"
$env:MIGRATION_EXPORT_PATH = "migration\local-data.json"
```

The export is intentionally not committed. It contains financial data and should remain local.

## Import

After Prisma is configured with a PostgreSQL `DATABASE_URL` and `DIRECT_URL`, and only after confirming the target database:

```powershell
$env:OWNER_USER_ID = "the-supabase-auth-user-id"
$env:OWNER_EMAIL = "owner@example.com"
$env:HOUSEHOLD_NAME = "Family household"
$env:MIGRATION_EXPORT_PATH = "migration\local-data.json"
npm run migration:import
```

The import creates one household and owner membership, then copies accounts, categories, transactions, budgets, and rules while preserving IDs and timestamps. It does not delete or modify the SQLite source.

## Import only categories and categorisation rules

To merge the local SQLite categories and user-created rules into an existing
PostgreSQL household without importing accounts, transactions, or budgets:

```powershell
$env:TARGET_HOUSEHOLD_ID = "the-existing-household-id"
npm run migration:categories-rules
```

The command reads `prisma/dev.db` by default (or `SQLITE_DATABASE_PATH`),
creates missing categories/rules, and updates matching category metadata and
rule category assignments to match SQLite. It is safe to rerun and does not
delete categories or rules from either database.

## RLS policy and isolation checks

The household RLS policies are in `prisma/rls.sql`; apply them with:

```powershell
npm run db:rls
```

Inspect policy definitions and role settings with:

```powershell
npm run db:rls:inspect
```

Run database-level isolation tests with two temporary Supabase Auth users:

```powershell
npm run test:rls
```

That test creates temporary household fixtures, tests reads and write isolation under the PostgreSQL `authenticated` role, and then deletes the fixtures and test users.

To test the real Next.js auth cookie and API path, start `npm run dev` in another terminal, then run:

```powershell
npm run test:auth-api
```

It creates temporary Auth users, signs one in, exercises household/account routes, confirms a second household's account is not returned, then removes the test users and records. Keep `.env.local` out of source control.
