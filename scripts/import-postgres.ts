import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

type Row = Record<string, unknown>;
type ExportPayload = {
  format: string;
  accounts: Row[];
  categories: Row[];
  transactions: Row[];
  budgets: Row[];
  categoryRules: Row[];
};

const exportPath = process.env.MIGRATION_EXPORT_PATH || "migration/local-data.json";
const householdName = process.env.HOUSEHOLD_NAME || "Family household";
async function main() {
  const ownerUserId = process.env.OWNER_USER_ID;
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerUserId || !ownerEmail) {
    throw new Error("OWNER_USER_ID and OWNER_EMAIL are required.");
  }

  const payload = JSON.parse(await readFile(exportPath, "utf8")) as ExportPayload;
  if (payload.format !== "budget-tracker-sqlite-export-v1") {
    throw new Error("Unsupported migration export format.");
  }

  const prisma = new PrismaClient();
  const asDate = (value: unknown): Date =>
    value instanceof Date ? value : new Date(String(value));

  try {
    const result = await prisma.$transaction(async (tx) => {
    const household = await tx.household.create({
      data: {
        name: householdName,
        members: {
          create: { userId: ownerUserId, email: ownerEmail, role: "owner" },
        },
      },
    });

    for (const row of payload.categories) {
      await tx.category.create({
        data: {
          id: String(row.id),
          name: String(row.name),
          type: String(row.type),
          color: String(row.color),
          icon: String(row.icon),
          householdId: household.id,
        },
      });
    }

    for (const row of payload.accounts) {
      await tx.account.create({
        data: {
          id: String(row.id),
          name: String(row.name),
          type: String(row.type),
          institution: String(row.institution ?? ""),
          householdId: household.id,
          createdAt: asDate(row.createdAt),
        },
      });
    }

    for (const row of payload.transactions) {
      await tx.transaction.create({
        data: {
          id: String(row.id),
          date: asDate(row.date),
          description: String(row.description),
          merchant: row.merchant == null ? null : String(row.merchant),
          amountPence: Number(row.amountPence),
          source: String(row.source),
          importHash: row.importHash == null ? null : String(row.importHash),
          notes: row.notes == null ? null : String(row.notes),
          categorySource: String(row.categorySource),
          categoryId: row.categoryId == null ? null : String(row.categoryId),
          accountId: row.accountId == null ? null : String(row.accountId),
          householdId: household.id,
          createdAt: asDate(row.createdAt),
        },
      });
    }

    for (const row of payload.budgets) {
      await tx.budget.create({
        data: {
          id: String(row.id),
          categoryId: String(row.categoryId),
          amountPence: Number(row.amountPence),
          householdId: household.id,
        },
      });
    }

    for (const row of payload.categoryRules) {
      await tx.categoryRule.create({
        data: {
          id: String(row.id),
          pattern: String(row.pattern),
          categoryId: String(row.categoryId),
          householdId: household.id,
          createdAt: asDate(row.createdAt),
        },
      });
    }

    return {
      householdId: household.id,
      accounts: payload.accounts.length,
      categories: payload.categories.length,
      transactions: payload.transactions.length,
      budgets: payload.budgets.length,
      categoryRules: payload.categoryRules.length,
    };
  });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
