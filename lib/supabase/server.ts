import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

/** Must match the header names set in middleware.ts. */
const VERIFIED_USER_ID_HEADER = "x-verified-user-id";
const VERIFIED_USER_EMAIL_HEADER = "x-verified-user-email";

function getSupabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return { url, anonKey };
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseConfig();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies. Middleware refreshes them.
        }
      },
    },
  });
}

/**
 * Returns the authenticated user for the current request.
 *
 * Every matched route already passes through middleware.ts, which calls
 * supabase.auth.getUser() once (verifying the JWT against Supabase Auth) and
 * forwards the verified id/email via trusted, spoof-proof request headers.
 * We read those headers first to avoid a second identical network round
 * trip to Supabase Auth on every API call / Server Component render.
 *
 * A Supabase client (bound to the request's cookies) is still constructed
 * and returned so callers that need it (e.g. for session refresh) have
 * access to it. If the trusted headers are absent — e.g. this is invoked
 * from a path middleware doesn't cover — we fall back to the real
 * auth.getUser() call so behaviour is never less correct, only potentially
 * slower on that uncommon path.
 */
export async function requireAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();

  const headerStore = await headers();
  const verifiedId = headerStore.get(VERIFIED_USER_ID_HEADER);
  if (verifiedId) {
    const verifiedEmail = headerStore.get(VERIFIED_USER_EMAIL_HEADER);
    return {
      supabase,
      user: { id: verifiedId, email: verifiedEmail ?? undefined } as {
        id: string;
        email?: string;
      },
    };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase, user: null };
  }

  return { supabase, user };
}

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin access is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
