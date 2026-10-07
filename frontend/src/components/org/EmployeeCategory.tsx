"use client";

import { useState, type FormEvent } from "react";
import { canManageAccess, ROLE_OPTIONS } from "@/lib/access";
import { OrgError, setStaffAccess } from "@/lib/org/api";
import type { Staff, StaffAccess } from "@/lib/org/types";
import { useRoles } from "../RolesProvider";
import { ProfileSection } from "./ProfileParts";

/**
 * An employee's Category: the roles on their sign-in account, which decide what they can see in
 * every ORCA app (Provider, Admin, HR...). Admins change it here; everyone else sees it. A record
 * without an account gets linked to their ORCA email on the first save.
 */
export function EmployeeCategory({ staff, onSaved }: { staff: Staff; onSaved: (access: StaffAccess) => void }) {
  const roles = useRoles();
  const [editing, setEditing] = useState(false);
  const access = staff.access ?? null;
  const held = access?.roles ?? [];
  const canEdit = canManageAccess(roles);

  return (
    <ProfileSection
      title="Category"
      action={
        canEdit && !editing ? (
          <button type="button" className="button" onClick={() => setEditing(true)}>
            Edit category
          </button>
        ) : undefined
      }
    >
      {editing ? (
        <CategoryEditor
          staff={staff}
          onCancel={() => setEditing(false)}
          onSaved={(next) => {
            setEditing(false);
            onSaved(next);
          }}
        />
      ) : (
        <>
          {held.length ? (
            <ul className="role-badges" aria-label="Category">
              {ROLE_OPTIONS.filter((r) => held.includes(r.key)).map((r) => (
                <li key={r.key} className="role-badge" title={r.description}>
                  {r.label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="profile-empty">{access ? "No category yet: they see only what every employee sees." : "Not linked to a sign-in account yet."}</p>
          )}
          {access && (
            <p className="profile-note">
              Signs in as {access.email}
              {!access.active && " · account turned off"}. Category decides what they can see in ORCA apps.
            </p>
          )}
        </>
      )}
    </ProfileSection>
  );
}

function CategoryEditor({ staff, onCancel, onSaved }: { staff: Staff; onCancel: () => void; onSaved: (access: StaffAccess) => void }) {
  const access = staff.access ?? null;
  const [chosen, setChosen] = useState<string[]>(access?.roles ?? []);
  const [email, setEmail] = useState(staff.workEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toggle = (key: string) => setChosen((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!access && !email.trim()) {
      setError("Enter their ORCA email to link their sign-in account.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSaved(await setStaffAccess(staff.id, chosen, access ? undefined : email.trim()));
    } catch (err) {
      setError(err instanceof OrgError ? err.message : "The category couldn't be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="category-editor" onSubmit={submit} noValidate>
      <fieldset className="field">
        <legend>Turn on everything that applies</legend>
        <div className="role-toggles">
          {ROLE_OPTIONS.map((r) => (
            <label key={r.key} className="role-toggle" title={r.description}>
              <input type="checkbox" checked={chosen.includes(r.key)} onChange={() => toggle(r.key)} disabled={busy} />
              <span>
                <strong>{r.label}</strong>
                <small>{r.description}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {!access && (
        <div className="field">
          <label htmlFor="category-email">ORCA email</label>
          <input id="category-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@orcarehab.com" autoComplete="off" disabled={busy} />
          <span className="field-hint">Links their sign-in account to this record. If they haven&apos;t signed in yet, the category is ready when they do.</span>
        </div>
      )}
      {error && (
        <div className="editor-feedback is-blocking" role="alert">
          <p>{error}</p>
        </div>
      )}
      <div className="category-actions">
        <button type="button" className="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="button button-primary-sm" disabled={busy}>
          {busy ? "Saving…" : "Save category"}
        </button>
      </div>
    </form>
  );
}
