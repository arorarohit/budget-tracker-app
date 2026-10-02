/**
 * Shared sign-out routine — used by both the desktop sidebar (components/
 * Nav.tsx) and the mobile nav (components/MobileNav.tsx) so the two surfaces
 * can never drift out of sync on what sign-out actually does (clear Supabase
 * session, clear the inactivity clock, hard-redirect to /login).
 */
import { clearInactivityClock } from "@/lib/auth/inactivity";

export async function signOut(): Promise<void> {
  // Lazy-load the Supabase browser client (and its auth-js dependency) only
  // when the user actually signs out, instead of bundling it into every
  // route's initial JS via a static top-level import — both Nav and
  // MobileNav render on every single page.
  const { createSupabaseBrowserClient } = await import("@/lib/supabase/browser");
  const supabase = createSupabaseBrowserClient();
  await supabase.auth.signOut();
  // Clear the inactivity clock so the next sign-in (this tab or any other)
  // doesn't inherit a stale "last active" timestamp and get immediately
  // signed out again by InactivityLogout on mount.
  clearInactivityClock();
  window.location.href = "/login";
}
