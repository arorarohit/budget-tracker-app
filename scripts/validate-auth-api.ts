import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

function loadEnvFiles() {
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
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
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !publishableKey || !secretKey) {
  throw new Error("Supabase URL and keys are required for auth/API validation.");
}

const admin = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const prisma = new PrismaClient();
const runId = randomUUID();
const testPassword = `T-${randomUUID()}-9aZ!`;
const createdUserIds: string[] = [];
const createdHouseholdIds: string[] = [];
const origin = process.env.LOCAL_APP_URL || "http://localhost:3000";

async function createTestUser(label: string) {
  const email = `api-rls-${label}-${runId}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: testPassword,
    email_confirm: true,
  });
  if (error) throw error;
  createdUserIds.push(data.user.id);
  return { id: data.user.id, email };
}

async function main() {
  const userA = await createTestUser("a");
  const userB = await createTestUser("b");
  const householdB = await prisma.household.create({
    data: {
      name: `API isolation fixture ${runId}`,
      members: {
        create: {
          userId: userB.id,
          email: userB.email,
          role: "owner",
        },
      },
      accounts: {
        create: {
          name: `Shared account name ${runId}`,
        },
      },
      categories: {
        create: {
          name: `Shared category name ${runId}`,
        },
      },
    },
  });
  createdHouseholdIds.push(householdB.id);

  let cookieJar: Array<{ name: string; value: string }> = [];
  const authClient = createServerClient(supabaseUrl!, publishableKey!, {
    cookies: {
      getAll: () => cookieJar,
      setAll: (cookiesToSet) => {
        cookieJar = cookiesToSet.map(({ name, value }) => ({ name, value }));
      },
    },
  });
  const { error: signInError } = await authClient.auth.signInWithPassword({
    email: userA.email,
    password: testPassword,
  });
  if (signInError) throw signInError;
  const cookieHeader = cookieJar.map(({ name, value }) => `${name}=${value}`).join("; ");

  async function request(path: string, method = "GET", body?: unknown) {
    const response = await fetch(new URL(path, origin), {
      method,
      headers: {
        Cookie: cookieHeader,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload: unknown = await response.json();
    return { status: response.status, payload };
  }

  const createHouseholdResponse = await request("/api/household", "POST", {
    name: `API test household ${runId}`,
  });
  assert(createHouseholdResponse.status === 201, "Authenticated household creation API failed.");
  const householdAId = String(
    (createHouseholdResponse.payload as { householdId?: unknown }).householdId
  );
  createdHouseholdIds.push(householdAId);

  const householdResponse = await request("/api/household");
  const householdInfo = (
    householdResponse.payload as { household?: { id?: string } | null }
  ).household;
  assert(
    householdResponse.status === 200 && householdInfo?.id === householdAId,
    "Authenticated household read via API/RLS failed."
  );

  const createAccountResponse = await request("/api/accounts", "POST", {
    name: `Shared account name ${runId}`,
    type: "current",
  });
  assert(createAccountResponse.status === 201, "Authenticated account insert API failed.");

  const accountList = await request("/api/accounts");
  assert(Array.isArray(accountList.payload), "Account list API returned an invalid response.");
  const accounts = accountList.payload as Array<{ name: string }>;
  assert(accountList.status === 200, "Authenticated account list API failed.");
  assert(
    accounts.length === 1 &&
      accounts[0].name === `Shared account name ${runId}`,
    "The user cannot read its own household account through the API."
  );

  const createCategoryResponse = await request("/api/categories", "POST", {
    name: `Shared category name ${runId}`,
  });
  assert(createCategoryResponse.status === 201, "Cross-household category name reuse failed through API.");
  const categoryList = await request("/api/categories");
  assert(
    Array.isArray(categoryList.payload) &&
      categoryList.payload.length === 1 &&
      categoryList.payload[0].name === `Shared category name ${runId}`,
    "The API exposed another household's category or failed to scope category access."
  );

  console.log("Authenticated API/RLS validation passed:");
  console.log("- Supabase sign-in cookie authenticated a local API request");
  console.log("- household bootstrap and read succeeded through application routes");
  console.log("- account creation/listing used the request-scoped authenticated database role");
  console.log("- distinct households reused account/category names without cross-household visibility");
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

main()
  .catch((error) => {
    console.error("Authenticated API validation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    let cleanupComplete = true;
    for (const householdId of createdHouseholdIds) {
      try {
        await prisma.household.delete({ where: { id: householdId } });
      } catch (error) {
        console.error("Failed to clean an API validation household:", error);
        cleanupComplete = false;
        process.exitCode = 1;
      }
    }
    for (const userId of createdUserIds) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        console.error("Failed to remove a temporary API test user:", error.message);
        cleanupComplete = false;
        process.exitCode = 1;
      }
    }
    await prisma.$disconnect();
    if (cleanupComplete) console.log("Temporary API users and household records cleaned up.");
  });
