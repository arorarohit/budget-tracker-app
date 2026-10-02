"use client";

/**
 * Decides whether the authenticated app chrome (sidebar Nav + content frame)
 * should wrap the current page. /login, /auth/*, and /setup are NOT part of
 * the authenticated app — they must render full-bleed on their own, with no
 * Nav sidebar, since there's no session (or no household yet) to navigate
 * with. Previously the root layout always rendered <Nav /> + the flex shell
 * unconditionally around every route, so the sidebar bled onto the login
 * screen (visible in prod: a full Dashboard/Transactions/Budgets/... sidebar
 * sitting next to the sign-in card) — this component is the fix.
 *
 * Below the `sm` breakpoint (real phones), the sidebar in Nav.tsx is `hidden`
 * with historically NO replacement — the app was unusable on a phone past
 * whatever page you landed on. MobileHeader + MobileTabBar (both `sm:hidden`)
 * fill that gap. Everything at `sm` and above — this includes iPad portrait
 * (768px) and landscape (1024px), as well as laptop/desktop — renders EXACTLY
 * as before: unchanged <Nav /> sidebar, unchanged <main> padding.
 */
import { usePathname } from "next/navigation";
import Nav from "@/components/Nav";
import { MobileHeader, MobileTabBar } from "@/components/MobileNav";
import { isAuthExemptPath } from "@/lib/auth/exempt-paths";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isAuthExemptPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col sm:flex-row">
      <MobileHeader />
      <Nav />
      {/* pb-20 reserves space for the fixed MobileTabBar so content never sits
          underneath it — sm:pb-8 restores the original desktop bottom padding
          exactly, since the tab bar doesn't render at sm and above. */}
      <main className="flex-1 min-w-0 px-6 pb-20 pt-6 sm:px-6 sm:pb-8 sm:pt-8 lg:px-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <MobileTabBar />
    </div>
  );
}
