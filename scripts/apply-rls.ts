import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function splitSqlStatements(source: string): string[] {
  const statements: string[] = [];
  let buffer = "";
  let dollarTag: string | null = null;
  let inSingleQuote = false;

  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (dollarTag) {
      if (source.startsWith(dollarTag, index)) {
        buffer += dollarTag;
        index += dollarTag.length - 1;
        dollarTag = null;
      } else {
        buffer += char;
      }
      continue;
    }

    if (inSingleQuote) {
      buffer += char;
      if (char === "'" && source[index + 1] === "'") {
        buffer += source[++index];
      } else if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      buffer += char;
      continue;
    }

    const tagMatch = source.slice(index).match(/^\$[A-Za-z0-9_]*\$/);
    if (tagMatch) {
      dollarTag = tagMatch[0];
      buffer += dollarTag;
      index += dollarTag.length - 1;
      continue;
    }

    if (char === ";") {
      if (buffer.trim()) statements.push(buffer.trim());
      buffer = "";
      continue;
    }
    buffer += char;
  }

  if (buffer.trim()) statements.push(buffer.trim());
  if (dollarTag || inSingleQuote) {
    throw new Error("Unterminated quoted SQL string in RLS policy file.");
  }
  return statements;
}

async function main() {
  const sql = await readFile("prisma/rls.sql", "utf8");
  const statements = splitSqlStatements(
    sql.replace(/^\s*--.*$/gm, "").replace(/^\s*-- @statement\s*$/gm, "")
  );
  if (statements.length < 10) {
    throw new Error(`Expected RLS policy statements, found ${statements.length}.`);
  }

  await prisma.$transaction(async (tx) => {
    for (const statement of statements) {
      await tx.$executeRawUnsafe(statement);
    }
  });

  console.log(`Applied ${statements.length} RLS statements.`);
}

main()
  .catch((error) => {
    console.error("RLS policy application failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
