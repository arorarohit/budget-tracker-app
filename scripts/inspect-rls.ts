import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const inspectionUserId = randomUUID();

async function main() {
  const tables = await prisma.$queryRaw<
    Array<{
      table_name: string;
      rls_enabled: boolean;
      rls_forced: boolean;
    }>
  >`
    SELECT c.relname AS table_name,
           c.relrowsecurity AS rls_enabled,
           c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
    ORDER BY c.relname
  `;

  const policies = await prisma.$queryRaw<
    Array<{
      tablename: string;
      policyname: string;
      roles: string[];
      cmd: string;
      qual: string | null;
      with_check: string | null;
    }>
  >`
    SELECT tablename, policyname, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `;

  const currentRole = await prisma.$queryRaw<
    Array<{ current_user: string; session_user: string; bypass_rls: boolean }>
  >`
    SELECT current_user,
           session_user,
           COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user), false) AS bypass_rls
  `;

  const uniquenessPreflight = await prisma.$queryRaw<
    Array<{
      duplicate_account_name_groups: bigint;
      duplicate_category_name_groups: bigint;
      duplicate_import_hash_groups: bigint;
    }>
  >`
    SELECT
      (SELECT count(*) FROM (
        SELECT "householdId", name FROM public."Account"
        GROUP BY "householdId", name HAVING count(*) > 1
      ) duplicates)::bigint AS duplicate_account_name_groups,
      (SELECT count(*) FROM (
        SELECT "householdId", name FROM public."Category"
        GROUP BY "householdId", name HAVING count(*) > 1
      ) duplicates)::bigint AS duplicate_category_name_groups,
      (SELECT count(*) FROM (
        SELECT "householdId", "importHash" FROM public."Transaction"
        WHERE "importHash" IS NOT NULL
        GROUP BY "householdId", "importHash" HAVING count(*) > 1
      ) duplicates)::bigint AS duplicate_import_hash_groups
  `;

  const authenticatedRoleReads = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL ROLE authenticated`;
    await tx.$executeRaw`SELECT set_config('request.jwt.claim.sub', ${inspectionUserId}, true)`;
    await tx.$executeRaw`SELECT set_config('request.jwt.claims', ${JSON.stringify(
      { sub: inspectionUserId, role: "authenticated" }
    )}, true)`;

    const results: Array<{ table: string; visibleRows: bigint }> = [];
    for (const tableName of [
      "Household",
      "HouseholdMember",
      "Account",
      "Category",
      "Transaction",
      "Budget",
      "CategoryRule",
    ]) {
      const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT count(*)::bigint AS count FROM public."${tableName}"`
      );
      results.push({ table: tableName, visibleRows: rows[0].count });
    }
    return results;
  });

  console.log(
    JSON.stringify(
      {
        currentRole,
        uniquenessPreflight: Object.fromEntries(
          Object.entries(uniquenessPreflight[0]).map(([key, value]) => [
            key,
            Number(value),
          ])
        ),
        tables,
        policies,
        authenticatedRoleReads: authenticatedRoleReads.map((item) => ({
          ...item,
          visibleRows: Number(item.visibleRows),
        })),
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("RLS inspection failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
