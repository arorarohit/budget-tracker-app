import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const runId = randomUUID();
const householdName = `Validation household ${runId}`;
const userId = `validation-user-${runId}`;

async function main() {
  let householdId: string | undefined;

  try {
    const household = await prisma.household.create({
      data: {
        name: householdName,
        members: {
          create: {
            userId,
            email: `${userId}@example.invalid`,
            role: "owner",
          },
        },
      },
    });
    householdId = household.id;

    const [account, category] = await Promise.all([
      prisma.account.create({
        data: {
          name: `Validation account ${runId}`,
          type: "current",
          householdId,
        },
      }),
      prisma.category.create({
        data: {
          name: `Validation category ${runId}`,
          type: "expense",
          householdId,
        },
      }),
    ]);

    const transaction = await prisma.transaction.create({
      data: {
        date: new Date("2026-09-01T00:00:00.000Z"),
        description: "Temporary household validation transaction",
        amountPence: -1234,
        accountId: account.id,
        categoryId: category.id,
        householdId,
      },
    });

    const membership = await prisma.householdMember.findFirst({
      where: { householdId, userId },
    });
    const scopedTransactions = await prisma.transaction.findMany({
      where: { householdId },
      select: { id: true, amountPence: true },
    });

    if (
      !membership ||
      membership.role !== "owner" ||
      scopedTransactions.length !== 1 ||
      scopedTransactions[0].id !== transaction.id ||
      scopedTransactions[0].amountPence !== -1234
    ) {
      throw new Error("Household membership or household-scoped transaction validation failed.");
    }

    console.log(
      "Household create, owner membership, related records, and household-scoped read passed."
    );
  } finally {
    if (householdId) {
      await prisma.household.delete({ where: { id: householdId } });
      const remaining = await prisma.household.findUnique({
        where: { id: householdId },
        select: { id: true },
      });
      if (remaining) {
        throw new Error("Temporary validation household cleanup failed.");
      }
      console.log("Temporary validation records cleaned up.");
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
