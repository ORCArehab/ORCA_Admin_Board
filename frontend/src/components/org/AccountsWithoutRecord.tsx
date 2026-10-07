"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { ErrorState, LoadingState } from "@/components/ui";
import { ROLE_OPTIONS } from "@/lib/access";
import { formatDate } from "@/lib/format";
import { OrgError } from "@/lib/org/api";
import { useOrgResource } from "@/lib/org/useOrgResource";
import { addPerson, listPeople, setPersonActive, setPersonRoles, type Person } from "@/lib/people";
import { Avatar } from "./ProfileParts";

/** "New employee", prefilled from a sign-in account; saving it links the account to the record. */
export function newEmployeeHref(p: Pick<Person, "email" | "name">): string {
  const query = new URLSearchParams({ account: p.email });
  if (p.name) query.set("name", p.name);
  return `/employees/new?${query}`;
}

/**
 * Admins only (Employees → Accounts without a record): sign-in accounts not linked to any
 * employee record, such as someone added before their record existed or a shared mailbox. An
 * admin can create the employee record, change the account's roles, or turn it off. Everyone with
 * a record is managed on their profile (Access). Every change is recorded with your name.
 */
export function AccountsWithoutRecord() {
  const state = useOrgResource(() => listPeople().then((people) => people.filter((p) => !p.staff)), []);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  const all = useMemo(() => (state.status === "ready" ? state.data : []), [state]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((p) => !q || [p.name, p.email].some((v) => v?.toLowerCase().includes(q)));
  }, [all, query]);

  const update = (id: string, change: (p: Person) => Person) => state.replace((people) => people.map((p) => (p.id === id ? change(p) : p)));

  return (
    <>
      {adding && (
        <AddPerson
          onCancel={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            state.reload();
          }}
        />
      )}
      {state.status === "loading" && <LoadingState />}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" && (
        <>
          <div className="directory-toolbar">
            <input className="search" type="search" placeholder="Search name or email" aria-label="Search accounts" value={query} onChange={(e) => setQuery(e.target.value)} />
            <span className="table-count">{rows.length === all.length ? `${all.length} accounts` : `${rows.length} of ${all.length}`}</span>
            {!adding && (
              <button type="button" className="button" onClick={() => setAdding(true)}>
                + Add sign-in account
              </button>
            )}
          </div>
          <p className="profile-note profile-note-lead">
            These accounts can sign in to ORCA apps but aren&apos;t linked to an employee record. Create the record to manage them like everyone else, or turn off accounts nobody should use.
          </p>
          {rows.length === 0 ? (
            <p className="directory-empty">{all.length === 0 ? "Every sign-in account has an employee record." : "No accounts match."}</p>
          ) : (
            <ul className="people-list" aria-label="Accounts without a record">
              {rows.map((p) => (
                <PersonRow key={p.id} person={p} onChange={(change) => update(p.id, change)} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

function PersonRow({ person: p, onChange }: { person: Person; onChange: (change: (p: Person) => Person) => void }) {
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState<string[]>(p.roles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof OrgError ? err.message : "That couldn't be saved.");
    } finally {
      setBusy(false);
    }
  }

  const saveRoles = () =>
    run(async () => {
      await setPersonRoles(p, chosen);
      onChange((x) => ({ ...x, roles: ROLE_OPTIONS.filter((r) => chosen.includes(r.key)).map((r) => r.key) }));
      setEditing(false);
    });
  const toggleActive = () =>
    run(async () => {
      await setPersonActive(p.id, !p.active);
      onChange((x) => ({ ...x, active: !x.active }));
    });

  return (
    <li className={`people-row${p.active ? "" : " is-former"}`}>
      <div className="people-who">
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Google profile photos, small and remote.
          <img src={p.imageUrl} alt="" className="people-photo" referrerPolicy="no-referrer" />
        ) : (
          <Avatar name={p.name ?? p.email} />
        )}
        <span className="directory-main">
          <span className="directory-name">{p.name ?? p.email}</span>
          <span className="directory-sub">
            {p.email}
            {" · "}
            {p.lastSignInAt ? `last signed in ${formatDate(p.lastSignInAt)}` : "hasn't signed in yet"}
          </span>
        </span>
      </div>
      <div className="people-access">
        {editing ? (
          <div className="role-toggles people-toggles">
            {ROLE_OPTIONS.map((r) => (
              <label key={r.key} className="role-toggle" title={r.description}>
                <input type="checkbox" checked={chosen.includes(r.key)} onChange={() => setChosen((c) => (c.includes(r.key) ? c.filter((k) => k !== r.key) : [...c, r.key]))} disabled={busy} />
                <span>
                  <strong>{r.label}</strong>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <ul className="role-badges" aria-label="Roles">
            {!p.active && <li className="role-badge role-badge-off">Turned off</li>}
            {p.roles.length === 0 ? <li className="role-badge role-badge-none">Employee</li> : ROLE_OPTIONS.filter((r) => p.roles.includes(r.key)).map((r) => <li key={r.key} className="role-badge" title={r.description}>{r.label}</li>)}
          </ul>
        )}
        <div className="people-actions">
          {editing ? (
            <>
              <button type="button" className="button" onClick={() => { setEditing(false); setChosen(p.roles); setError(null); }} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="button button-primary-sm" onClick={saveRoles} disabled={busy}>
                {busy ? "Saving…" : "Save roles"}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="button" onClick={() => { setChosen(p.roles); setEditing(true); }} disabled={busy}>
                Edit roles
              </button>
              <button type="button" className="button" onClick={toggleActive} disabled={busy}>
                {p.active ? "Turn off" : "Turn on"}
              </button>
              <Link className="button button-primary-sm" href={newEmployeeHref(p)}>
                Create employee record
              </Link>
            </>
          )}
        </div>
        {error && <p className="docs-error" role="alert">{error}</p>}
      </div>
    </li>
  );
}

function AddPerson({ onCancel, onAdded }: { onCancel: () => void; onAdded: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addPerson(email.trim(), name.trim() || undefined);
      onAdded();
    } catch (err) {
      setError(err instanceof OrgError ? (err.status === 409 ? "That person is already here." : err.message) : "They couldn't be added.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel people-add" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="person-email">ORCA email</label>
        <input id="person-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@orcarehab.com" autoComplete="off" required disabled={busy} />
      </div>
      <div className="field">
        <label htmlFor="person-name">Name (optional)</label>
        <input id="person-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" disabled={busy} />
      </div>
      <div className="category-actions">
        <button type="button" className="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="button button-primary-sm" disabled={busy || !email.trim()}>
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
      {error && <p className="docs-error" role="alert">{error}</p>}
      <p className="field-hint">Add someone before their first sign-in so their roles are ready. For an employee, create their record instead and set Access on their profile.</p>
    </form>
  );
}
