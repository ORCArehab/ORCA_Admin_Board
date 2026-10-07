"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { ROLE_OPTIONS } from "@/lib/access";
import { formatDate } from "@/lib/format";
import { OrgError } from "@/lib/org/api";
import { useOrgResource } from "@/lib/org/useOrgResource";
import { addPerson, listPeople, setPersonActive, setPersonRoles, type Person } from "@/lib/people";
import { Avatar } from "./org/ProfileParts";

/**
 * Everyone who can sign in to ORCA apps and their roles (what they can see). An employee's roles
 * are also their Category on their profile; accounts not linked to an employee record (or added
 * before their first sign-in) are managed here. Every change is recorded with your name.
 */
export function PeopleScreen() {
  const state = useOrgResource(() => listPeople(), []);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [adding, setAdding] = useState(false);

  const all = useMemo(() => (state.status === "ready" ? state.data : []), [state]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (p) =>
        (!role || (role === "none" ? p.roles.length === 0 : p.roles.includes(role))) &&
        (!q || [p.name, p.email, p.staff?.displayName].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [all, query, role]);

  const update = (id: string, change: (p: Person) => Person) => state.replace((people) => people.map((p) => (p.id === id ? change(p) : p)));

  return (
    <>
      <PageHeader
        title="People & Roles"
        description="Who can sign in to ORCA apps, and what each person can see. An employee's roles also show as their Category on their profile."
        aside={
          <button type="button" className="button button-primary-sm" onClick={() => setAdding((a) => !a)}>
            + Add person
          </button>
        }
      />
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
            <input className="search" type="search" placeholder="Search name, email or employee" aria-label="Search people" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="select" aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">All roles</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
              <option value="none">No roles</option>
            </select>
            <span className="table-count">{rows.length === all.length ? `${all.length} people` : `${rows.length} of ${all.length}`}</span>
          </div>
          {rows.length === 0 ? (
            <p className="directory-empty">Nobody matches these filters.</p>
          ) : (
            <ul className="people-list" aria-label="People">
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
            {p.staff ? (
              <>
                {" · "}
                <Link className="text-link" href={`/employees/${p.staff.id}`}>
                  {p.staff.displayName}
                </Link>
              </>
            ) : (
              " · no employee record linked"
            )}
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
      <p className="field-hint">Add someone before their first sign-in so their roles are ready. To give an employee roles, you can also set their Category on their profile.</p>
    </form>
  );
}
