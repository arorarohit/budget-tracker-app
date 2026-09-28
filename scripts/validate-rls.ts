import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient, type Prisma } from "@prisma/client";

function loadEnvFiles() {
  for (const file of [".env", ".env.local"]) {
    try {
      const contents = require("node:fs").readFileSync(file, "utf8") as string;
      for (const line of contents.split(/\r?\n/)) {
        const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
        if (!match || process.env[match[1]]) continue;
        process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
      }
    } catch {
      continue;
    }
  }
}

loadEnvFiles();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !secretKey) {
  throw new Error("Supabase URL and server secret are required for temporary test users.");
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const prisma = new PrismaClient();
const runId = randomUUID();
const createdUserIds: string[] = [];
const householdIds: string[] = [];

async function runAsUser<T>(
  userId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL ROLE authenticated`;
    await tx.$executeRaw`SELECT set_config('request.jwt.claim.sub', ${userId}, true)`;
    await tx.$executeRaw`SELECT set_config('request.jwt.claims', ${JSON.stringify(
      { sub: userId, role: "authenticated" }
    )}, true)`;
    return operation(tx);
  });
}

async function createTestUser(label: string) {
  const email = `rls-${label}-${runId}@example.invalid`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: `T-${randomUUID()}-9aZ!`,
    email_confirm: true,
  });
  if (error) throw error;
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email };
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  const userA = await createTestUser("a");
  const userB = await createTestUser("b");

  const householdA = await prisma.household.create({
    data: {
      name: `RLS Test A ${runId}`,
      members: {
        create: { userId: userA.id, email: userA.email, role: "owner" },
      },
    },
  });
  householdIds.push(householdA.id);

  const householdB = await prisma.household.create({
    data: {
      name: `RLS Test B ${runId}`,
      members: {
        create: { userId: userB.id, email: userB.email, role: "owner" },
      },
    },
  });
  householdIds.push(householdB.id);

  const fixtureA = await createFixture(householdA.id, "A");
  const fixtureB = await createFixture(householdB.id, "B");
  assert(
    fixtureA.accountId !== fixtureB.accountId &&
      fixtureA.categoryId !== fixtureB.categoryId &&
      fixtureA.transactionId !== fixtureB.transactionId,
    "Separate households could not reuse account/category names and transaction import hash."
  );

  const sameHouseholdDuplicates = await Promise.all([
    expectUniqueViolation(() =>
      prisma.account.create({
        data: {
          name: `RLS shared name ${runId}`,
          householdId: householdA.id,
        },
      })
    ),
    expectUniqueViolation(() =>
      prisma.category.create({
        data: {
          name: `RLS shared category ${runId}`,
          householdId: householdA.id,
        },
      })
    ),
    expectUniqueViolation(() =>
      prisma.transaction.create({
        data: {
          date: new Date("2026-09-05T00:00:00.000Z"),
          description: `RLS duplicate import hash ${runId}`,
          amountPence: -1,
          importHash: `RLS-SHARED-HASH-${runId}`,
          householdId: householdA.id,
        },
      })
    ),
  ]);
  assert(
    sameHouseholdDuplicates.every(Boolean),
    "Same-household duplicate names or import hash were not rejected."
  );

  const visible = await runAsUser(userA.id, async (tx) => {
    const households = await tx.household.findMany({ select: { id: true } });
    const members = await tx.householdMember.findMany({ select: { userId: true } });
    const accounts = await tx.account.findMany({ select: { id: true } });
    const categories = await tx.category.findMany({ select: { id: true } });
    const transactions = await tx.transaction.findMany({ select: { id: true } });
    const budgets = await tx.budget.findMany({ select: { id: true } });
    const rules = await tx.categoryRule.findMany({ select: { id: true } });

    assert(households.length === 1 && households[0].id === householdA.id, "Household SELECT isolation failed.");
    assert(members.length === 1 && members[0].userId === userA.id, "Membership SELECT isolation failed.");
    assert(accounts.length === 1 && accounts[0].id === fixtureA.accountId, "Account SELECT isolation failed.");
    assert(categories.length === 1 && categories[0].id === fixtureA.categoryId, "Category SELECT isolation failed.");
    assert(transactions.length === 1 && transactions[0].id === fixtureA.transactionId, "Transaction SELECT isolation failed.");
    assert(budgets.length === 1 && budgets[0].id === fixtureA.budgetId, "Budget SELECT isolation failed.");
    assert(rules.length === 1 && rules[0].id === fixtureA.ruleId, "CategoryRule SELECT isolation failed.");
    assert(!accounts.some((row) => row.id === fixtureB.accountId), "Cross-household account became visible.");
    return true;
  });
  assert(visible, "RLS read test did not complete.");

  const ownTransaction = await runAsUser(userA.id, async (tx) =>
    tx.transaction.create({
      data: {
        date: new Date("2026-09-02T00:00:00.000Z"),
        description: `RLS own insert ${runId}`,
        amountPence: -101,
        householdId: householdA.id,
        accountId: fixtureA.accountId,
        categoryId: fixtureA.categoryId,
      },
      select: { id: true },
    })
  );

  const updateOwn = await runAsUser(userA.id, (tx) =>
    tx.transaction.updateMany({
      where: { id: ownTransaction.id },
      data: { notes: "own update allowed" },
    })
  );
  assert(updateOwn.count === 1, "RLS own UPDATE failed.");

  const crossUpdates = await runAsUser(userA.id, async (tx) => {
    const transaction = await tx.transaction.updateMany({
      where: { id: fixtureB.transactionId },
      data: { notes: "must not be written" },
    });
    const account = await tx.account.updateMany({
      where: { id: fixtureB.accountId },
      data: { institution: "must not be written" },
    });
    const category = await tx.category.updateMany({
      where: { id: fixtureB.categoryId },
      data: { color: "#000000" },
    });
    const budget = await tx.budget.updateMany({
      where: { id: fixtureB.budgetId },
      data: { amountPence: 1 },
    });
    const rule = await tx.categoryRule.updateMany({
      where: { id: fixtureB.ruleId },
      data: { pattern: `CROSS UPDATE ${runId}` },
    });
    return {
      transaction: transaction.count,
      account: account.count,
      category: category.count,
      budget: budget.count,
      rule: rule.count,
    };
  });
  assert(
    Object.values(crossUpdates).every((count) => count === 0),
    "Cross-household UPDATE was not blocked."
  );

  const crossDeletes = await runAsUser(userA.id, async (tx) => {
    const transaction = await tx.transaction.deleteMany({ where: { id: fixtureB.transactionId } });
    const account = await tx.account.deleteMany({ where: { id: fixtureB.accountId } });
    const category = await tx.category.deleteMany({ where: { id: fixtureB.categoryId } });
    const budget = await tx.budget.deleteMany({ where: { id: fixtureB.budgetId } });
    const rule = await tx.categoryRule.deleteMany({ where: { id: fixtureB.ruleId } });
    return {
      transaction: transaction.count,
      account: account.count,
      category: category.count,
      budget: budget.count,
      rule: rule.count,
    };
  });
  assert(
    Object.values(crossDeletes).every((count) => count === 0),
    "Cross-household DELETE was not blocked."
  );

  const crossInsertResults = await Promise.all([
    expectRlsDenied(userA.id, (tx) =>
      tx.account.create({
        data: {
          name: `RLS cross insert ${runId}`,
          type: "current",
          householdId: householdB.id,
        },
      })
    ),
    expectRlsDenied(userA.id, (tx) =>
      tx.category.create({
        data: {
          name: `RLS cross category ${runId}`,
          householdId: householdB.id,
        },
      })
    ),
    expectRlsDenied(userA.id, (tx) =>
      tx.transaction.create({
        data: {
          date: new Date("2026-09-04T00:00:00.000Z"),
          description: `RLS cross transaction ${runId}`,
          amountPence: -1,
          householdId: householdB.id,
          accountId: fixtureB.accountId,
          categoryId: fixtureB.categoryId,
        },
      })
    ),
    expectRlsDenied(userA.id, (tx) =>
      tx.budget.create({
        data: {
          householdId: householdB.id,
          categoryId: fixtureB.categoryId,
          amountPence: 100,
        },
      })
    ),
    expectRlsDenied(userA.id, (tx) =>
      tx.categoryRule.create({
        data: {
          householdId: householdB.id,
          categoryId: fixtureB.categoryId,
          pattern: `RLS CROSS RULE ${runId}`,
        },
      })
    ),
  ]);
  assert(crossInsertResults.every(Boolean), "A cross-household INSERT was not denied by RLS.");

  const crossTenantRelationDenied = await Promise.all([
    runAsUser(userA.id, (tx) =>
      tx.transaction.create({
        data: {
          date: new Date("2026-09-03T00:00:00.000Z"),
          description: `RLS invalid foreign account ${runId}`,
          amountPence: -10,
          householdId: householdA.id,
          accountId: fixtureB.accountId,
          categoryId: fixtureA.categoryId,
        },
      })
    ).then(
      () => false,
      (error) => /row-level security|42501/i.test(String(error))
    ),
    runAsUser(userA.id, (tx) =>
      tx.budget.create({
        data: {
          householdId: householdA.id,
          categoryId: fixtureB.categoryId,
          amountPence: 1000,
        },
      })
    ).then(
      () => false,
      (error) => /row-level security|42501/i.test(String(error))
    ),
    runAsUser(userA.id, (tx) =>
      tx.categoryRule.create({
        data: {
          householdId: householdA.id,
          categoryId: fixtureB.categoryId,
          pattern: `BAD RLS RULE ${runId}`.toUpperCase(),
        },
      })
    ).then(
      () => false,
      (error) => /row-level security|42501/i.test(String(error))
    ),
  ]);
  assert(
    crossTenantRelationDenied.every(Boolean),
    "Cross-household foreign-key references were not denied by RLS."
  );

  const deleteOwn = await runAsUser(userA.id, (tx) =>
    tx.transaction.deleteMany({ where: { id: ownTransaction.id } })
  );
  assert(deleteOwn.count === 1, "RLS own DELETE failed.");

  console.log("RLS validation passed:");
  console.log("- temporary users could read only their own household across all seven tables");
  console.log("- own-tenant insert, update, and delete succeeded");
  console.log("- cross-tenant update and delete affected zero rows");
  console.log("- cross-tenant insert was denied by PostgreSQL RLS");
  console.log("- cross-household account/category references were denied by PostgreSQL RLS");
  console.log("- duplicate account/category names and import hashes work across households but remain unique within each household");
}

async function createFixture(householdId: string, label: string) {
  const account = await prisma.account.create({
    data: { name: `RLS shared name ${runId}`, householdId },
  });
  const category = await prisma.category.create({
    data: { name: `RLS shared category ${runId}`, householdId },
  });
  const transaction = await prisma.transaction.create({
    data: {
      date: new Date("2026-09-01T00:00:00.000Z"),
      description: `RLS transaction ${label} ${runId}`,
      amountPence: -200,
      importHash: `RLS-SHARED-HASH-${runId}`,
      householdId,
      accountId: account.id,
      categoryId: category.id,
    },
  });
  const budget = await prisma.budget.create({
    data: { householdId, categoryId: category.id, amountPence: 10000 },
  });
  const rule = await prisma.categoryRule.create({
    data: {
      householdId,
      categoryId: category.id,
      pattern: `RLS PATTERN ${label} ${runId}`.toUpperCase(),
    },
  });
  return {
    accountId: account.id,
    categoryId: category.id,
    transactionId: transaction.id,
    budgetId: budget.id,
    ruleId: rule.id,
  };
}

async function expectRlsDenied(
  userId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<unknown>
): Promise<boolean> {
  try {
    await runAsUser(userId, operation);
    return false;
  } catch (error) {
    return /row-level security|42501/i.test(String(error));
  }
}

async function expectUniqueViolation(operation: () => Promise<unknown>): Promise<boolean> {
  try {
    await operation();
    return false;
  } catch (error) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    );
  }
}

main()
  .catch((error) => {
    console.error("RLS validation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    let cleanupComplete = true;
    for (const householdId of householdIds) {
      try {
        await prisma.household.delete({ where: { id: householdId } });
      } catch (error) {
        console.error(`Failed to clean validation household ${householdId}:`, error);
        cleanupComplete = false;
        process.exitCode = 1;
      }
    }
    for (const userId of createdUserIds) {
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) {
        console.error("Failed to clean a temporary Supabase test user:", error.message);
        cleanupComplete = false;
        process.exitCode = 1;
      }
    }
    await prisma.$disconnect();
    if (cleanupComplete) console.log("Temporary test users and household records cleaned up.");
  });
