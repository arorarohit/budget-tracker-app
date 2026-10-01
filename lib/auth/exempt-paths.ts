/**
 * Routes that exist OUTSIDE the authenticated app shell: no session is
 * required (or guaranteed) to render them, so they must never be wrapped in
 * the authenticated chrome (Nav sidebar) or subjected to household/session
 * checks that assume a logged-in user.
 *
 * Single source of truth — previously this exact predicate was copy-pasted
 * independently in HouseholdGuard.tsx and InactivityLogout.tsx (and was
 * about to be needed a third time for AppShell.tsx), which is how it's easy
 * for one copy to drift from the others. Import this everywhere instead.
 */
export function isAuthExemptPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/auth/") || pathname === "/setup";
}
