/**
 * Shared constant + helpers for the cross-tab inactivity clock written by
 * components/InactivityLogout.tsx (see that file for the full design
 * rationale). Lives here — not inlined in InactivityLogout.tsx — because
 * sign-out and sign-in flows (Nav.tsx, login/page.tsx) also need to touch
 * this same localStorage key, and duplicating the key string across files
 * is exactly how it drifts out of sync.
 *
 * BUG THIS FIXES: previously only InactivityLogout.tsx ever WROTE this key
 * (on activity) and READ it (to resume the idle clock after a backgrounded
 * tab) — nothing ever cleared it. So after an inactivity-triggered sign-out,
 * the stale "5 minutes ago" timestamp stayed in localStorage. Signing back in
 * immediately re-mounted InactivityLogout, which saw that stale timestamp,
 * computed elapsed >= 5 minutes, and silently signed the user straight back
 * out before they could do anything — an infinite logout loop. The same
 * latent bug affected the manual "Sign out" button too (Nav.tsx), just less
 * visibly, since the next login would still have carried a stale clock.
 */
const STORAGE_KEY = "bt:lastActivity";

/** Call this on every sign-out path (manual button, inactivity timeout) so a
 * stale "idle" timestamp never survives into the next session. */
export function clearInactivityClock(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (private mode / quota) — nothing to clear.
  }
}

/** Call this right after a successful sign-in so the idle clock starts fresh
 * rather than inheriting whatever (possibly stale/absent) value preceded it. */
export function resetInactivityClock(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // localStorage unavailable — InactivityLogout still works per-tab via its
    // own in-memory timer, started fresh on the next page load regardless.
  }
}

export { STORAGE_KEY as INACTIVITY_STORAGE_KEY };
