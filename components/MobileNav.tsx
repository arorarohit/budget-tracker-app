"use client";

/**
 * Mobile navigation (< 640px / the `sm` breakpoint only) — replaces the
 * sidebar (components/Nav.tsx), which is `hidden` below `sm` with NO
 * replacement today. Without this, the app is unusable on a phone past
 * whatever single page you land on: there's no way to reach Transactions,
 * Budgets, Import, Categories, Household, or even sign out.
 *
 * Two pieces, both `sm:hidden` so they never appear on tablet/laptop (where
 * the existing sidebar in Nav.tsx, unchanged, continues to do the job):
 *  1. A slim top header — brand + a menu button for the less-frequent
 *     destinations (Household, Sign out) that don't fit in a thumb-reachable
 *     bottom bar.
 *  2. A fixed bottom tab bar — the 5 primary destinations, icon + label,
 *     safe-area aware for iOS home-indicator devices. Bottom tab bars (not a
 *     hamburger drawer) are the expected pattern for a small, fixed set of
 *     top-level destinations on mobile finance apps — everything stays one
 *     tap away with no extra open/close step.
 */
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { NAV_LINKS, isNavLinkActive } from "@/components/Nav";
import { signOut } from "@/lib/auth/sign-out";

// The 5 most-used destinations get a persistent bottom tab. Household is
// changed rarely (membership/roles) so it lives in the header menu instead of
// taking a 6th precious thumb-reachable slot.
const TAB_LINKS = NAV_LINKS.filter((l) => l.href !== "/household");
const MENU_ONLY_LINKS = NAV_LINKS.filter((l) => l.href === "/household");

export function MobileHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur sm:hidden">
      <div className="flex items-center gap-2 text-base font-bold tracking-tight">
        <span aria-hidden>💷</span> Budget Tracker
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="More options"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-xl text-slate-300 hover:bg-slate-800/60"
        >
          ⋯
        </button>

        {menuOpen && (
          <>
            {/* Backdrop to close on outside tap — covers the viewport beneath
                the menu panel, above everything else. */}
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-40 cursor-default"
            />
            <div
              role="menu"
              className="absolute right-0 top-12 z-50 w-48 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-xl"
            >
              {MENU_ONLY_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 text-sm ${
                    isNavLinkActive(pathname, l.href)
                      ? "bg-slate-800 font-medium text-white"
                      : "text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  <span>{l.icon}</span>
                  {l.label}
                </Link>
              ))}
              <button
                type="button"
                role="menuitem"
                onClick={() => void signOut()}
                className="flex w-full items-center gap-3 border-t border-slate-800 px-4 py-3 text-left text-sm text-slate-300 hover:bg-slate-800/60"
              >
                <span aria-hidden>🚪</span> Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-800 bg-slate-950/95 backdrop-blur sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TAB_LINKS.map((l) => {
        const active = isNavLinkActive(pathname, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            // min-h-[44px] tap target (Phase 4 will revisit sizing app-wide;
            // the primary nav gets it now since it's used on every screen).
            className={`flex min-h-[3rem] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[0.65rem] font-medium ${
              active ? "text-emerald-400" : "text-slate-500"
            }`}
          >
            <span className="text-lg leading-none">{l.icon}</span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
