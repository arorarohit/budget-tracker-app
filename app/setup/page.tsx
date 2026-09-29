"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type HouseholdResponse = {
  household: { id: string; name: string } | null;
};

export default function HouseholdSetupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkMembership = useCallback(async () => {
    setChecking(true);
    setError(null);

    try {
      const response = await fetch("/api/household", { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as
        | (HouseholdResponse & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(result?.error ?? `Could not check membership (${response.status})`);
      }

      if (result?.household) {
        router.replace("/");
        router.refresh();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not check membership");
    } finally {
      setChecking(false);
    }
  }, [router]);

  useEffect(() => {
    void checkMembership();
  }, [checkMembership]);

  async function createHousehold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/household", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(result?.error ?? `Could not create household (${response.status})`);
      }

      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create household");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <section className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-7 shadow-xl sm:p-9">
        <p className="text-sm font-medium text-indigo-300">Welcome to Budget Tracker</p>
        <h1 className="mt-2 text-2xl font-bold text-white">Set up your household</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Household members share accounts, categories, budgets, and transactions.
          Create a household if you’re setting one up, or ask its owner to add the
          email address you used to register.
        </p>

        {checking ? (
          <p className="mt-8 text-sm text-slate-400">Checking your household membership…</p>
        ) : (
          <>
            <form onSubmit={createHousehold} className="mt-8 space-y-4">
              <label className="block text-sm font-medium text-slate-300">
                Household name
                <input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Smith family"
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white placeholder:text-slate-600"
                />
              </label>
              <button
                type="submit"
                disabled={busy || !name.trim()}
                className="w-full rounded-lg bg-indigo-500 px-4 py-2.5 font-medium text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Creating household…" : "Create household"}
              </button>
            </form>

            <div className="mt-8 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <h2 className="font-medium text-slate-200">Joining your family?</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                For privacy, households aren’t listed publicly. Ask the household
                owner or an admin to add your registered email under Household
                settings, then check your membership here.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void checkMembership()}
                className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                I’ve been added — check again
              </button>
            </div>
          </>
        )}

        {error && <p role="alert" className="mt-5 text-sm text-rose-300">{error}</p>}
      </section>
    </main>
  );
}
