"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type HouseholdResponse = {
  household: { id: string; name: string } | null;
};

/** Once verified in this JS runtime, client-side navigation skips repeated
 * checks. Do not persist this between page loads: a different account may
 * sign in within the same browser tab. */
let sessionVerified = false;

function markVerified(): void {
  sessionVerified = true;
}

function isExemptPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/auth/") || pathname === "/setup";
}

export default function HouseholdGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Guards against re-running the network check on every pathname change once
  // this component instance has already confirmed access.
  const verifiedRef = useRef(false);

  const checkHousehold = useCallback(async () => {
    setChecking(true);
    setError(null);

    try {
      const response = await fetch("/api/household", { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as
        | (HouseholdResponse & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(result?.error ?? `Could not verify household (${response.status})`);
      }

      if (!result?.household) {
        router.replace("/setup");
        return;
      }

      verifiedRef.current = true;
      markVerified();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify household");
    } finally {
      setChecking(false);
    }
  }, [router]);

  useEffect(() => {
    if (isExemptPath(pathname)) {
      setChecking(false);
      setError(null);
      return;
    }

    // Already verified during this page load — skip the network round trip.
    // This is the key fix: navigating between authenticated pages no longer
    // re-triggers the household check or its full-screen loading gate.
    if (verifiedRef.current || sessionVerified) {
      verifiedRef.current = true;
      setChecking(false);
      setError(null);
      return;
    }

    void checkHousehold();
    // Intentionally re-evaluated on pathname change only to catch the initial
    // authenticated navigation post-login; the verifiedRef/session cache guard
    // above prevents any repeat network work once verified.
  }, [pathname, checkHousehold]);

  if (!isExemptPath(pathname) && checking) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-slate-400">Checking household access…</p>
      </main>
    );
  }

  if (!isExemptPath(pathname) && error) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <section className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h1 className="text-lg font-semibold">Couldn’t verify household access</h1>
          <p className="mt-2 text-sm text-slate-400">{error}</p>
          <button
            type="button"
            onClick={() => void checkHousehold()}
            className="mt-5 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
