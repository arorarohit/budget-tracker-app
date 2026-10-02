"use client";

import { FormEvent, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button, Input } from "@/components/ui";
import { resetInactivityClock } from "@/lib/auth/inactivity";

/** Illustrative category split for the hero panel — not tied to any real
 * account/data (nobody is signed in yet). Mirrors the app's own category
 * icons/names so the login screen looks like a preview of the real product
 * rather than decorative stock art. Widths are presentational only. */
const HERO_CATEGORIES: { icon: string; name: string; widthPct: number }[] = [
  { icon: "\uD83D\uDED2", name: "Groceries", widthPct: 78 },
  { icon: "\uD83D\uDE87", name: "Transport", widthPct: 52 },
  { icon: "\uD83C\uDFE0", name: "Rent & Mortgage", widthPct: 95 },
  { icon: "\uD83D\uDCFA", name: "Subscriptions", widthPct: 28 },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [nextPath, setNextPath] = useState("/");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextPath(params.get("next") || "/");
    if (params.get("error") === "config") {
      setMessage("Authentication is not configured for this environment.");
    } else if (params.get("reason") === "inactivity") {
      setMessage("You were signed out after 5 minutes of inactivity. Please sign in again.");
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const result =
        mode === "sign-in"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
            });

      if (result.error) throw result.error;

      if (mode === "sign-up") {
        setMessage(
          "Account created. Check your email if confirmation is enabled, then sign in. You can create a household or ask its owner to add your registered email."
        );
        setMode("sign-in");
        return;
      }

      // Start the inactivity clock fresh on every successful sign-in —
      // defense in depth alongside clearing it on sign-out (Nav.tsx,
      // InactivityLogout.tsx): a brand-new session should never inherit a
      // stale "last active" timestamp from whatever was in this browser
      // before, which is what previously caused an immediate re-logout loop
      // right after signing back in post-inactivity-timeout.
      resetInactivityClock();

      // A hard navigation (not router.replace/refresh) is required here: the
      // Supabase browser client has just written fresh auth cookies, and
      // middleware.ts needs to see them on a brand-new request to redirect
      // past /login correctly. Next's client-side router can race this (the
      // RSC cache / in-flight transition can retain the pre-login "/login"
      // render for a beat), which is exactly why Nav.tsx's sign-out already
      // uses window.location.href instead of the router for the same reason
      // in reverse. A full navigation also guarantees HouseholdGuard's
      // module-level `sessionVerified` flag starts clean for the new session.
      window.location.href = nextPath;
      return;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setBusy(true);
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google sign-in failed");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 lg:flex-row">
      {/* Hero panel: same dark canvas as the authenticated app (slate-950/900,
          slate-800 border) with emerald used only as an ACCENT — exactly how
          the rest of the product uses it (Nav, buttons, positive amounts).
          Previously this panel filled the background with solid emerald-950,
          which made the login screen read as a different, greener app from
          the one you land in after signing in. Grounded in the actual
          product (category breakdown using the Dashboard's own icon/label
          language), not generic decoration. */}
      <section className="flex flex-col justify-between border-b border-slate-800 bg-slate-900/60 px-8 py-10 lg:w-[44%] lg:border-b-0 lg:border-r lg:px-14 lg:py-16">
        <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-white">
          <span aria-hidden>💷</span> Budget Tracker
        </div>

        <div className="mt-10 lg:mt-0">
          <h1 className="max-w-sm text-3xl font-bold leading-tight tracking-tight text-white lg:text-4xl">
            Know where every pound goes.
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">
            One shared view of your household&apos;s accounts, budgets, and bank
            statements — built for the UK.
          </p>

          <div className="mt-10 max-w-xs space-y-3" aria-hidden>
            {HERO_CATEGORIES.map((c) => (
              <div key={c.name} className="flex items-center gap-3">
                <span className="w-6 text-center text-base">{c.icon}</span>
                <span className="w-32 shrink-0 text-xs text-slate-400">
                  {c.name}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <span
                    className="block h-full rounded-full bg-emerald-500"
                    style={{ width: `${c.widthPct}%` }}
                  />
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="hidden text-xs text-slate-500 lg:block">
          Bank-grade security · your data stays within your household
        </p>
      </section>

      {/* Form panel */}
      <section className="flex flex-1 items-center justify-center px-6 py-12 lg:px-16">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold text-white">
            {mode === "sign-in" ? "Sign in" : "Create your account"}
          </h2>
          <p className="mt-1.5 text-sm text-slate-400">
            {mode === "sign-in"
              ? "Welcome back — enter your details to continue."
              : "You can set up or join a household after signing in."}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <label className="block text-sm text-slate-300">
              Email
              <Input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1.5 w-full py-2"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Password
              <Input
                required
                minLength={8}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1.5 w-full py-2"
              />
            </label>
            <Button
              type="submit"
              variant="primary"
              disabled={busy}
              className="w-full justify-center py-2.5 text-sm"
            >
              {busy ? "Working…" : mode === "sign-in" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void signInWithGoogle()}
            className="mt-3 w-full justify-center py-2.5 text-sm"
          >
            Continue with Google
          </Button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "sign-in" ? "sign-up" : "sign-in");
              setMessage(null);
            }}
            className="mt-6 w-full text-center text-sm text-emerald-400 hover:text-emerald-300"
          >
            {mode === "sign-in"
              ? "Need an account? Register"
              : "Already registered? Sign in"}
          </button>

          {message && (
            <p role="status" className="mt-5 text-sm text-amber-300">
              {message}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
