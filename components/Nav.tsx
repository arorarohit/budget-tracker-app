"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth/sign-out";

/** Shared with components/MobileNav.tsx — single source of truth for the
 * app's top-level destinations so desktop and mobile navigation never list
 * different pages. */
export const NAV_LINKS = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/transactions", label: "Transactions", icon: "📋" },
  { href: "/budgets", label: "Budgets", icon: "🎯" },
  { href: "/import", label: "Import", icon: "📥" },
  { href: "/categories", label: "Categories", icon: "🏷️" },
  { href: "/household", label: "Household", icon: "👥" },
];

export function isNavLinkActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function Nav() {
  const pathname = usePathname();

  return (
    // Unchanged desktop behaviour: hidden below sm, exactly as before. Phase 1
    // mobile nav (components/MobileNav.tsx) is the replacement shown below sm
    // instead of nothing — this component's own breakpoint/markup is untouched.
    <nav className="w-56 shrink-0 border-r border-slate-800 bg-slate-900/50 px-3 py-6 hidden sm:block">
      <div className="px-3 pb-6">
        <div className="text-lg font-bold tracking-tight">
          💷 Budget Tracker
        </div>
        <div className="text-xs text-slate-500 mt-0.5">UK personal finance</div>
      </div>
      <ul className="space-y-1">
        {NAV_LINKS.map((l) => {
          const active = isNavLinkActive(pathname, l.href);
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
        onClick={() => void signOut()}
        className="mt-8 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
      >
        Sign out
      </button>
    </nav>
  );
}
