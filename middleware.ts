import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

/** Headers set here are trusted downstream — always overwritten on every
 * request, so an inbound client cannot spoof them. This lets API routes and
 * Server Components read the already-verified identity instead of calling
 * supabase.auth.getUser() a second time (saves one network round trip to
 * Supabase Auth per request). */
const VERIFIED_USER_ID_HEADER = "x-verified-user-id";
const VERIFIED_USER_EMAIL_HEADER = "x-verified-user-email";

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    if (isApiPath(request.nextUrl.pathname)) {
      return NextResponse.json(
        { error: "Authentication is not configured" },
        { status: 503 }
      );
    }

    return NextResponse.redirect(new URL("/login?error=config", request.url));
  }

  // Strip any client-supplied values for the trusted headers before we
  // (re)compute them below, so a caller can never inject a fake identity.
  request.headers.delete(VERIFIED_USER_ID_HEADER);
  request.headers.delete(VERIFIED_USER_EMAIL_HEADER);

  let pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        pendingCookies = cookiesToSet;
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (isApiPath(request.nextUrl.pathname)) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  request.headers.set(VERIFIED_USER_ID_HEADER, user.id);
  if (user.email) request.headers.set(VERIFIED_USER_EMAIL_HEADER, user.email);

  const response = NextResponse.next({ request });
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  return response;
}

export const config = {
  matcher: [
    "/((?!login|auth/callback|_next/static|_next/image|favicon.ico).*)",
  ],
};
