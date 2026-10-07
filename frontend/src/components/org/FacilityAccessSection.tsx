"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { canSee } from "@/lib/access";
import { accessStamps } from "@/lib/org/accessStamps";
import { createFacilityAccess, deleteFacilityAccess, listStaff, revealFacilityAccessPassword, updateFacilityAccess, type FacilityAccessInput } from "@/lib/org/api";
import { ACCESS_STATUS_LABELS, LOGIN_METHOD_LABELS, facilityLogins, labelFor, systemLabel, type FacilityAccess, type FacilityDetail, type Staff } from "@/lib/org/types";
import { useOrgResource } from "@/lib/org/useOrgResource";
import { ProfileSection } from "./ProfileParts";
import { RevealedSecret, useRevealedSecret } from "./RevealedSecret";
import { useRoles } from "../RolesProvider";

const PROVIDER_CATEGORIES = ["physician", "np_pa"];

/**
 * Hospital logins: each provider's login at this facility, for PointClickCare or another hospital
 * system, as the ORCA API returns them pre-joined (detail.access). Separate from Assigned staff:
 * someone assigned here without a PointClickCare login is called out below the list. Passwords
 * are never loaded with the page; Reveal asks the API, which records it on the facility and the
 * provider. Delete removes the login and its password (also recorded).
 */
export function FacilityAccessSection({ detail, onChanged }: { detail: FacilityDetail; onChanged: (logins: FacilityAccess[]) => void }) {
  const roles = useRoles();
  const logins = facilityLogins(detail);
  const [adding, setAdding] = useState(false);
  const withPcc = new Set(logins.filter((a) => a.system === "pcc").map((a) => a.staff.id));
  const assignedWithout = uniqueStaff(detail.assignments.map((a) => a.staff)).filter((s) => !withPcc.has(s.id));
  const replace = (next: FacilityAccess) => onChanged(logins.some((a) => a.id === next.id) ? logins.map((a) => (a.id === next.id ? next : a)) : [...logins, next]);
  const remove = (id: string) => onChanged(logins.filter((a) => a.id !== id));
  // PointClickCare first, then other systems by name.
  const systems = [...new Set(logins.map(systemLabel))].sort((x, y) => (x === "PointClickCare" ? -1 : y === "PointClickCare" ? 1 : x.localeCompare(y)));

  return (
    <ProfileSection
      title="Hospital logins"
      action={
        !adding && (
          <button type="button" className="text-link profile-section-link link-button" onClick={() => setAdding(true)}>
            + Add login
          </button>
        )
      }
    >
      {logins.length === 0 && !adding && <p className="profile-empty">No hospital logins recorded for this facility.</p>}
      {systems.map((system) => (
        <div key={system} className="access-group">
          <h3 className="access-system">{system}</h3>
          <ul className="login-rows">
            {logins
              .filter((a) => systemLabel(a) === system)
              .map((a) => (
                <AccessRow key={a.id} access={a} linkStaff={canSee(roles, "employees")} onSaved={replace} onDeleted={() => remove(a.id)} />
              ))}
          </ul>
        </div>
      ))}
      {adding && (
        <AccessEditor
          facilityId={detail.facility.id}
          access={null}
          withPcc={withPcc}
          suggested={assignedWithout}
          onCancel={() => setAdding(false)}
          onSaved={(a) => {
            replace(a);
            setAdding(false);
          }}
        />
      )}
      {assignedWithout.length > 0 && !adding && (
        <p className="profile-note">Assigned here without a PointClickCare login: {assignedWithout.map((s) => s.displayName).join(", ")}.</p>
      )}
      <p className="profile-note">Passwords are encrypted. Each reveal, change and deletion is recorded on this facility and the provider.</p>
    </ProfileSection>
  );
}

function uniqueStaff(list: { id: string; displayName: string }[]) {
  return [...new Map(list.map((s) => [s.id, s])).values()];
}

function AccessRow({
  access: a,
  linkStaff,
  onSaved,
  onDeleted,
}: {
  access: FacilityAccess;
  linkStaff: boolean;
  onSaved: (a: FacilityAccess) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteFacilityAccess(a.id);
      onDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't delete.");
      setDeleting(false);
    }
  }
  const secret = useRevealedSecret(() => revealFacilityAccessPassword(a.id));

  if (editing) {
    return (
      <li className="login-row">
        <AccessEditor
          facilityId={a.facility.id}
          access={a}
          withPcc={new Set()}
          suggested={[]}
          onCancel={() => setEditing(false)}
          onSaved={(next) => {
            onSaved(next);
            setEditing(false);
            secret.hide();
            secret.setMessage("Saved.");
          }}
        />
      </li>
    );
  }

  const method = a.loginMethod === "unknown" ? null : `${labelFor(LOGIN_METHOD_LABELS, a.loginMethod)}${a.loginMethodDetail ? ` (${a.loginMethodDetail})` : ""}`;
  return (
    <li className="login-row">
      <div className="login-main">
        <span className="login-system">
          {linkStaff ? (
            <Link className="table-link" href={`/employees/${a.staff.id}`}>
              {a.staff.displayName}
            </Link>
          ) : (
            a.staff.displayName
          )}
          <span className={`access-status access-status-${a.status}`}>{labelFor(ACCESS_STATUS_LABELS, a.status)}</span>
        </span>
        <span className="login-detail">
          {[a.username ? `Username: ${a.username}` : "No username", method && `MFA: ${method}`, a.organization].filter(Boolean).join(" · ")}
        </span>
        {accessStamps(a).map((s) => (
          <span key={s.text} className={`login-detail ${s.byProvider ? "access-by-provider" : "muted"}`}>
            {s.text}
          </span>
        ))}
        <span className="login-detail muted">
          {!a.hasPassword && "No password saved"}
          {!a.hasPassword && !a.assigned && " · "}
          {!a.assigned && "Not currently assigned here"}
        </span>
        {a.notes && <span className="login-detail muted access-notes">{a.notes}</span>}
        <RevealedSecret secret={secret} />
        {confirming && (
          <span className="access-delete-confirm" role="alert">
            Delete {a.staff.displayName}&apos;s {systemLabel(a)} login? The saved password is deleted too. This can&apos;t be undone.
            <span className="access-delete-actions">
              <button type="button" className="button" onClick={() => setConfirming(false)} disabled={deleting}>
                Keep it
              </button>
              <button type="button" className="button button-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete login"}
              </button>
            </span>
            {deleteError && <span className="record-error">{deleteError}</span>}
          </span>
        )}
      </div>
      <div className="login-actions">
        {a.hasPassword && secret.value === null && (
          <button type="button" className="button" onClick={secret.reveal} disabled={secret.busy}>
            {secret.busy ? "Revealing…" : "Reveal"}
          </button>
        )}
        <button type="button" className="button" onClick={() => setEditing(true)} disabled={secret.busy || deleting}>
          Edit
        </button>
        {!confirming && (
          <button type="button" className="button button-quiet access-delete" onClick={() => setConfirming(true)} disabled={secret.busy}>
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

/** Add (access null) or edit one record. A new password is never pre-filled; blank keeps the saved one. */
function AccessEditor({
  facilityId,
  access,
  withPcc,
  suggested,
  onCancel,
  onSaved,
}: {
  facilityId: string;
  access: FacilityAccess | null;
  /** Providers who already have a PointClickCare login here. */
  withPcc: Set<string>;
  suggested: { id: string; displayName: string }[];
  onCancel: () => void;
  onSaved: (a: FacilityAccess) => void;
}) {
  const [staffId, setStaffId] = useState(suggested[0]?.id ?? "");
  const [system, setSystem] = useState<"pcc" | "other">(access?.system ?? "pcc");
  const [systemName, setSystemName] = useState(access?.systemName ?? "");
  const [organization, setOrganization] = useState(access?.organization ?? "");
  const [username, setUsername] = useState(access?.username ?? "");
  const [password, setPassword] = useState("");
  const [removePassword, setRemovePassword] = useState(false);
  const [loginMethod, setLoginMethod] = useState(access?.loginMethod ?? "unknown");
  const [loginMethodDetail, setLoginMethodDetail] = useState(access?.loginMethodDetail ?? "");
  const [status, setStatus] = useState(access?.status ?? "active");
  const [notes, setNotes] = useState(access?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idBase = `access-${access?.id ?? "new"}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = (v: string) => (v.trim() === "" ? null : v.trim());
    const values: FacilityAccessInput = {
      organization: text(organization),
      username: text(username),
      loginMethod,
      loginMethodDetail: text(loginMethodDetail),
      status,
      notes: text(notes),
    };
    if (system === "other") {
      if (!systemName.trim()) {
        setError("Name the system, for example Workspace / Fluency Flex.");
        return;
      }
      values.systemName = systemName.trim();
    }
    if (removePassword) values.password = null;
    else if (password) values.password = password; // never trimmed: spaces can be part of a password
    setBusy(true);
    setError(null);
    try {
      if (access) {
        // Send only what changed, so the activity lists real changes.
        const changes = Object.fromEntries(
          Object.entries(values).filter(([key, value]) => key === "password" || ((access as unknown as Record<string, unknown>)[key] ?? null) !== value),
        );
        onSaved((await updateFacilityAccess(access.id, changes)).access);
      } else {
        if (!staffId) {
          setError("Choose a provider.");
          setBusy(false);
          return;
        }
        onSaved(await createFacilityAccess({ ...values, staffId, facilityId, system }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setBusy(false);
    }
  }

  return (
    <form className="login-editor access-editor" onSubmit={submit} autoComplete="off">
      <span className="login-system">{access ? `${access.staff.displayName} · ${systemLabel(access)}` : "Add a hospital login"}</span>
      <div className="login-editor-grid">
        {!access && (
          <div className="field">
            <label htmlFor={`${idBase}-system`}>System</label>
            <select id={`${idBase}-system`} value={system} onChange={(e) => setSystem(e.target.value as "pcc" | "other")}>
              <option value="pcc">PointClickCare</option>
              <option value="other">Another system…</option>
            </select>
          </div>
        )}
        {system === "other" && (
          <div className="field">
            <label htmlFor={`${idBase}-system-name`}>System name</label>
            <input id={`${idBase}-system-name`} value={systemName} onChange={(e) => setSystemName(e.target.value)} maxLength={100} placeholder="e.g. Workspace / Fluency Flex" />
          </div>
        )}
        {!access && <ProviderPicker id={`${idBase}-staff`} value={staffId} onChange={setStaffId} excluded={system === "pcc" ? withPcc : new Set()} suggested={system === "pcc" ? suggested : []} />}
        <div className="field">
          <label htmlFor={`${idBase}-org`}>Company / organization</label>
          <input id={`${idBase}-org`} value={organization} onChange={(e) => setOrganization(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${idBase}-user`}>Username / ID</label>
          <input id={`${idBase}-user`} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" spellCheck={false} />
        </div>
        <div className="field">
          <label htmlFor={`${idBase}-pass`}>{access?.hasPassword ? "New password" : "Password"}</label>
          <input
            id={`${idBase}-pass`}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder={access?.hasPassword ? "Leave blank to keep the saved one" : ""}
            disabled={removePassword}
          />
        </div>
        <div className="field">
          <label htmlFor={`${idBase}-mfa`}>MFA / login method</label>
          <select id={`${idBase}-mfa`} value={loginMethod} onChange={(e) => setLoginMethod(e.target.value)}>
            {Object.entries(LOGIN_METHOD_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${idBase}-mfa-detail`}>MFA detail</label>
          <input id={`${idBase}-mfa-detail`} value={loginMethodDetail} onChange={(e) => setLoginMethodDetail(e.target.value)} placeholder="e.g. which phone. Never a code." />
        </div>
        <div className="field">
          <label htmlFor={`${idBase}-status`}>Status</label>
          <select id={`${idBase}-status`} value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(ACCESS_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field record-wide">
          <label htmlFor={`${idBase}-notes`}>Notes</label>
          <textarea id={`${idBase}-notes`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <span className="field-hint">Operational only. Never patient information.</span>
        </div>
      </div>
      {access?.hasPassword && (
        <label className="check">
          <input type="checkbox" checked={removePassword} onChange={(e) => setRemovePassword(e.target.checked)} />
          Remove the saved password
        </label>
      )}
      {error && (
        <span className="record-error" role="alert">
          {error}
        </span>
      )}
      <div className="login-editor-actions">
        <button type="button" className="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="button button-primary-sm" disabled={busy}>
          {busy ? "Saving…" : access ? "Save" : "Add login"}
        </button>
      </div>
    </form>
  );
}

/** Providers assigned here without access first, then other providers, then everyone else. */
function ProviderPicker({
  id,
  value,
  onChange,
  excluded,
  suggested,
}: {
  id: string;
  value: string;
  onChange: (id: string) => void;
  excluded: Set<string>;
  suggested: { id: string; displayName: string }[];
}) {
  const staff = useOrgResource(listStaff, []);
  const groups = useMemo(() => {
    const all: Staff[] = staff.status === "ready" ? staff.data.filter((s) => !excluded.has(s.id) && s.employmentStatus !== "separated") : [];
    const suggestedIds = new Set(suggested.map((s) => s.id));
    const sort = (list: Staff[]) => [...list].sort((a, b) => a.displayName.localeCompare(b.displayName));
    return {
      providers: sort(all.filter((s) => !suggestedIds.has(s.id) && PROVIDER_CATEGORIES.includes(s.category))),
      others: sort(all.filter((s) => !suggestedIds.has(s.id) && !PROVIDER_CATEGORIES.includes(s.category))),
    };
  }, [staff, excluded, suggested]);

  return (
    <div className="field record-wide">
      <label htmlFor={id}>Provider</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">{staff.status === "loading" ? "Loading…" : "Choose a provider"}</option>
        {suggested.length > 0 && (
          <optgroup label="Assigned here">
            {suggested.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </optgroup>
        )}
        {groups.providers.length > 0 && (
          <optgroup label="Providers">
            {groups.providers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </optgroup>
        )}
        {groups.others.length > 0 && (
          <optgroup label="Other staff">
            {groups.others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {staff.status === "error" && <span className="field-error">The staff list couldn&apos;t be loaded.</span>}
    </div>
  );
}
