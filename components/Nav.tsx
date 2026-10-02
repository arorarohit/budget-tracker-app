"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clearInactivityClock } from "@/lib/auth/inactivity";

const LINKS = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/transactions", label: "Transactions", icon: "📋" },
  { href: "/budgets", label: "Budgets", icon: "🎯" },
  { href: "/import", label: "Import", icon: "📥" },
  { href: "/categories", label: "Categories", icon: "🏷️" },
  { href: "/household", label: "Household", icon: "👥" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="w-56 shrink-0 border-r border-slate-800 bg-slate-900/50 px-3 py-6 hidden sm:block">
      <div className="px-3 pb-6">
        <div className="text-lg font-bold tracking-tight">
          💷 Budget Tracker
        </div>
        <div className="text-xs text-slate-500 mt-0.5">UK personal finance</div>
      </div>
      <ul className="space-y-1">
        {LINKS.map((l) => {
          const active =
            l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-slate-800 text-white font-medium"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                }`}
              >
                <span>{l.icon}</span>
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={async () => {
          // Lazy-load the Supabase browser client (and its auth-js dependency)
          // only when the user actually signs out, instead of bundling it
          // into every route's initial JS via a static top-level import. Nav
          // renders on every single page, so this keeps the sign-out-only
          // code out of the route transition's critical JS path.
          const { createSupabaseBrowserClient } = await import(
            "@/lib/supabase/browser"
          );
          const supabase = createSupabaseBrowserClient();
          await supabase.auth.signOut();
          // Clear the inactivity clock so the next sign-in (this tab or any
          // other) doesn't inherit a stale "last active" timestamp and get
          // immediately signed out again by InactivityLogout on mount.
          clearInactivityClock();
          window.location.href = "/login";
        }}
        className="mt-8 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
      >
        Sign out
      </button>
    </nav>
  );
}
