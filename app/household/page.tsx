"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Household = {
  id: string;
  name: string;
};

type Membership = {
  email: string;
  role: string;
};

type Member = {
  id: string;
  email: string;
  role: "owner" | "admin" | "member";
  createdAt: string;
};

type HouseholdResponse = {
  household: Household | null;
  membership?: Membership;
  error?: string;
};

export default function HouseholdPage() {
  const [household, setHousehold] = useState<Household | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [householdResponse, membersResponse] = await Promise.all([
        fetch("/api/household", { cache: "no-store" }),
        fetch("/api/household/members", { cache: "no-store" }),
      ]);
      const householdResult = (await householdResponse.json()) as HouseholdResponse;
      const membersResult = (await membersResponse.json()) as
        | Member[]
        | { error?: string };

      if (!householdResponse.ok) {
        throw new Error(householdResult.error ?? "Could not load household");
      }
      if (!membersResponse.ok) {
        throw new Error(
          !Array.isArray(membersResult) && membersResult.error
            ? membersResult.error
            : "Could not load household members"
        );
      }

      setHousehold(householdResult.household);
      setMembership(householdResult.membership ?? null);
      setMembers(Array.isArray(membersResult) ? membersResult : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load household");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/household/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const result = (await response.json()) as Member | { error?: string };
      if (!response.ok) {
        throw new Error("error" in result && result.error ? result.error : "Could not add member");
      }
      if (!("email" in result)) {
        throw new Error("The server returned an invalid member response");
      }

      setEmail("");
      setMessage(`${result.email} has been added to the household.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add member");
    } finally {
      setBusy(false);
    }
  }

  async function updateMember(member: Member, action: "admin" | "member" | "remove") {
    const removing = action === "remove";
    if (
      removing &&
      !window.confirm(`Remove ${member.email} from this household?`)
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/household/members", {
        method: removing ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          removing
            ? { memberId: member.id }
            : { memberId: member.id, role: action }
        ),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Could not update household member");
      }

      setMessage(
        removing
          ? `${member.email} has been removed.`
          : `${member.email} is now an ${action === "admin" ? "admin" : "member"}.`
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update household member");
    } finally {
      setBusy(false);
    }
  }

  const canManage = membership?.role === "owner" || membership?.role === "admin";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Household settings</h1>
        <p className="mt-1 text-sm text-slate-400">
          Manage who can see and update your shared budget data.
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-slate-400">Loading household…</p>
      ) : error && !household ? (
        <section className="rounded-xl border border-rose-900/60 bg-rose-950/30 p-5">
          <p role="alert" className="text-sm text-rose-300">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
          >
            Try again
          </button>
        </section>
      ) : household ? (
        <>
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Household</p>
            <h2 className="mt-1 text-xl font-semibold">{household.name}</h2>
            <p className="mt-2 text-sm text-slate-400">
              Signed in as {membership?.email} · {membership?.role}
            </p>
          </section>

          {canManage && (
            <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="text-lg font-semibold">Add a household member</h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                They must register first. Add the same email address they used to
                register; the household will then be available when they sign in.
              </p>
              <form onSubmit={addMember} className="mt-4 grid gap-3 sm:grid-cols-[1fr_9rem_auto]">
                <label className="sr-only" htmlFor="member-email">Registered email</label>
                <input
                  id="member-email"
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-600"
                />
                <label className="sr-only" htmlFor="member-role">Role</label>
                <select
                  id="member-role"
                  value={role}
                  onChange={(event) => setRole(event.target.value as "member" | "admin")}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  type="submit"
                  disabled={busy || !email.trim()}
                  className="rounded-lg bg-indigo-500 px-4 py-2 font-medium text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add member
                </button>
              </form>
            </section>
          )}

          <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 px-5 py-4">
              <h2 className="font-semibold">Members</h2>
            </div>
            <ul className="divide-y divide-slate-800">
              {members.map((member) => (
                <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="font-medium">{member.email}</p>
                    <p className="mt-1 text-xs capitalize text-slate-500">
                      {member.role} · Joined {new Date(member.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {canManage && member.role !== "owner" && (
                    <div className="flex items-center gap-3">
                      <select
                        aria-label={`Role for ${member.email}`}
                        value={member.role}
                        disabled={busy}
                        onChange={(event) =>
                          void updateMember(member, event.target.value as "admin" | "member")
                        }
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void updateMember(member, "remove")}
                        className="text-sm text-rose-300 hover:text-rose-200 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {error && household && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}
    </div>
  );
}
