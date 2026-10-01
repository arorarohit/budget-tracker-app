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
 */
import { usePathname } from "next/navigation";
import Nav from "@/components/Nav";
import { isAuthExemptPath } from "@/lib/auth/exempt-paths";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isAuthExemptPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Nav />
      <main className="flex-1 min-w-0 px-6 py-8 lg:px-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
