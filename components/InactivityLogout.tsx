"use client";

/**
 * Silently signs the user out after 5 minutes of inactivity (no mouse
 * movement, click, keypress, scroll, or touch), then hard-redirects to
 * /login with a message explaining why. Renders nothing — purely a side
 * effect wrapped around the authenticated app shell in app/layout.tsx.
 *
 * Design notes:
 *  - Activity timestamp is mirrored to localStorage so multiple tabs of the
 *    app share one idle clock: being active in tab A resets the timer in
 *    idle tab B too (via the `storage` event), avoiding a surprise logout
 *    in a tab the user isn't currently looking at but still has open.
 *  - On mount (e.g. a backgrounded tab resumes, or the page is freshly
 *    loaded), we also check the last recorded activity immediately —
 *    browsers throttle/suspend setTimeout in background tabs, so a pure
 *    timer could fail to fire while the tab was hidden; this catches that
 *    case the moment the tab becomes active again.
 *  - Activity listeners are throttled (at most once per second) so a
 *    continuous mousemove/scroll doesn't cause excessive localStorage writes.
 *  - Exempt on /login, /auth/*, /setup — there's no authenticated session to
 *    expire there (and /setup's own checks don't need this overhead).
 */
import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isAuthExemptPath } from "@/lib/auth/exempt-paths";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const THROTTLE_MS = 1000;
const STORAGE_KEY = "bt:lastActivity";
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "wheel",
];

export default function InactivityLogout() {
  const pathname = usePathname();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResetRef = useRef(0);
  const loggingOutRef = useRef(false);

  const signOutForInactivity = useCallback(async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    try {
      // Lazy-load the Supabase browser client only when actually needed,
      // matching the pattern already used for sign-out in components/Nav.tsx
      // — keeps this code out of every route's initial JS bundle.
      const { createSupabaseBrowserClient } = await import(
        "@/lib/supabase/browser"
      );
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // Even if sign-out fails client-side (e.g. offline), still redirect —
      // middleware will bounce to /login again if a session actually remains.
    } finally {
      window.location.href = "/login?reason=inactivity";
    }
  }, []);

  const scheduleTimeout = useCallback(
    (msRemaining: number) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => void signOutForInactivity(), msRemaining);
    },
    [signOutForInactivity]
  );

  const recordActivity = useCallback(
    (broadcast: boolean) => {
      const now = Date.now();
      if (broadcast) {
        if (now - lastResetRef.current < THROTTLE_MS) return;
        lastResetRef.current = now;
        try {
          window.localStorage.setItem(STORAGE_KEY, String(now));
        } catch {
          // localStorage unavailable (private mode / quota) — timer still
          // works for this tab alone via the in-memory reset below.
        }
      }
      scheduleTimeout(IDLE_TIMEOUT_MS);
    },
    [scheduleTimeout]
  );

  useEffect(() => {
    if (isAuthExemptPath(pathname)) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      return;
    }

    // Catch the "tab was backgrounded past the timeout" case immediately on
    // mount/navigation, since a suspended tab's own setTimeout may not have
    // fired while hidden.
    let initialRemaining = IDLE_TIMEOUT_MS;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const elapsed = Date.now() - Number(stored);
        if (elapsed >= IDLE_TIMEOUT_MS) {
          void signOutForInactivity();
          return;
        }
        initialRemaining = IDLE_TIMEOUT_MS - elapsed;
      }
    } catch {
      // ignore, fall back to full timeout
    }
    scheduleTimeout(initialRemaining);

    const onActivity = () => recordActivity(true);
    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, onActivity, { passive: true })
    );

    function onStorage(e: StorageEvent) {
      // Another tab recorded activity — reset this tab's timer too, without
      // re-writing localStorage ourselves (avoids an event echo loop).
      if (e.key === STORAGE_KEY && e.newValue) {
        scheduleTimeout(IDLE_TIMEOUT_MS);
      }
    }
    window.addEventListener("storage", onStorage);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onActivity));
      window.removeEventListener("storage", onStorage);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [pathname, recordActivity, scheduleTimeout, signOutForInactivity]);

  return null;
}
