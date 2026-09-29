import Database from "better-sqlite3";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

type LocalCategory = {
  id: string;
  name: string;
  type: string;
  color: string;
  icon: string;
};

type LocalRule = {
  id: string;
  pattern: string;
  categoryId: string;
  createdAt: string | number | Date;
};

function loadEnvFiles() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(
        line
      );
      if (!match || process.env[match[1]] !== undefined) continue;
      const rawValue = match[2];
      const value =
        (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
        (rawValue.startsWith("'") && rawValue.endsWith("'"))
          ? rawValue.slice(1, -1)
          : rawValue;
      process.env[match[1]] = value;
    }
  }
}

loadEnvFiles();

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required; no target household was selected.`);
  }
  return value;
}

const householdId = requiredEnvironmentVariable("TARGET_HOUSEHOLD_ID");

const databasePath = path.resolve(
  process.env.SQLITE_DATABASE_PATH || "prisma/dev.db"
);
const sqlite = new Database(databasePath, { readonly: true });
const prisma = new PrismaClient();

function assertUnique(values: string[], label: string) {
  if (new Set(values).size !== values.length) {
    throw new Error(`The local SQLite database contains duplicate ${label}.`);
  }
}

async function main() {
  let categories: LocalCategory[];
  let rules: LocalRule[];

  try {
    categories = sqlite
      .prepare('SELECT id, name, type, color, icon FROM "Category" ORDER BY name')
      .all() as LocalCategory[];
    rules = sqlite
      .prepare(
        'SELECT id, pattern, categoryId, createdAt FROM "CategoryRule" ORDER BY pattern'
      )
      .all() as LocalRule[];
  } finally {
    sqlite.close();
  }

  assertUnique(categories.map((category) => category.name), "category names");
  assertUnique(rules.map((rule) => rule.pattern), "rule patterns");

  const categoryIds = new Set(categories.map((category) => category.id));
  for (const rule of rules) {
    if (!categoryIds.has(rule.categoryId)) {
      throw new Error(
        `Local rule "${rule.pattern}" references a category missing from SQLite.`
      );
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const household = await tx.household.findUnique({
      where: { id: householdId },
      select: { id: true, name: true },
    });
    if (!household) {
      throw new Error("The selected target household does not exist in PostgreSQL.");
    }

    const existingCategories = await tx.category.findMany({
      where: { householdId },
      select: { name: true },
    });
    const existingRules = await tx.categoryRule.findMany({
      where: { householdId },
      select: { pattern: true },
    });
    const existingCategoryNames = new Set(
      existingCategories.map((category) => category.name)
    );
    const existingRulePatterns = new Set(
      existingRules.map((rule) => rule.pattern)
    );
    const categoryIdMap = new Map<string, string>();

    for (const category of categories) {
      const saved = await tx.category.upsert({
        where: {
          householdId_name: { householdId, name: category.name },
        },
        update: {
          type: category.type,
          color: category.color,
          icon: category.icon,
        },
        create: { ...category, householdId },
        select: { id: true },
      });
      categoryIdMap.set(category.id, saved.id);
    }

    for (const rule of rules) {
      const categoryId = categoryIdMap.get(rule.categoryId);
      if (!categoryId) {
        throw new Error(`Could not map local category for rule "${rule.pattern}".`);
      }
      const createdAt =
        rule.createdAt instanceof Date
          ? rule.createdAt
          : new Date(rule.createdAt);
      if (Number.isNaN(createdAt.getTime())) {
        throw new Error(`Local rule "${rule.pattern}" has an invalid creation date.`);
      }

      await tx.categoryRule.upsert({
        where: {
          householdId_pattern: { householdId, pattern: rule.pattern },
        },
        update: { categoryId },
        create: {
          pattern: rule.pattern,
          categoryId,
          householdId,
          createdAt,
        },
      });
    }

    return {
      household: household.name,
      categoriesProcessed: categories.length,
      categoriesCreated: categories.filter(
        (category) => !existingCategoryNames.has(category.name)
      ).length,
      categoriesAlreadyPresent: categories.filter((category) =>
        existingCategoryNames.has(category.name)
      ).length,
      rulesProcessed: rules.length,
      rulesCreated: rules.filter((rule) => !existingRulePatterns.has(rule.pattern))
        .length,
      rulesAlreadyPresent: rules.filter((rule) =>
        existingRulePatterns.has(rule.pattern)
      ).length,
    };
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error("Category and rule import failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
