import Database from "better-sqlite3";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type ExportTable = Record<string, unknown>[];

const databasePath = process.env.SQLITE_DATABASE_PATH
  ? path.resolve(process.env.SQLITE_DATABASE_PATH)
  : path.resolve("prisma/dev.db");
const outputPath = path.resolve(
  process.env.MIGRATION_EXPORT_PATH || "migration/local-data.json"
);

async function main() {
  const db = new Database(databasePath, { readonly: true });
  try {
    const table = (name: string): ExportTable =>
      db.prepare(`SELECT * FROM "${name}"`).all() as ExportTable;

    const payload = {
      format: "budget-tracker-sqlite-export-v1",
      exportedAt: new Date().toISOString(),
      source: databasePath,
      accounts: table("Account"),
      categories: table("Category"),
      transactions: table("Transaction"),
      budgets: table("Budget"),
      categoryRules: table("CategoryRule"),
    };

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
    console.log(`Exported local SQLite data to ${outputPath}`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
