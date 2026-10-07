"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { canSee } from "@/lib/access";
import { formatDate } from "@/lib/format";
import { createFacilityAccess, listStaff, revealFacilityAccessPassword, updateFacilityAccess, type FacilityAccessInput } from "@/lib/org/api";
import { ACCESS_STATUS_LABELS, LOGIN_METHOD_LABELS, labelFor, type FacilityAccess, type FacilityDetail, type Staff } from "@/lib/org/types";
import { useOrgResource } from "@/lib/org/useOrgResource";
import { ProfileSection } from "./ProfileParts";
import { RevealedSecret, useRevealedSecret } from "./RevealedSecret";
import { useRoles } from "../RolesProvider";

const PROVIDER_CATEGORIES = ["physician", "np_pa"];

/**
 * Facility access: each provider's PointClickCare login for this facility, as the ORCA API
 * returns it pre-joined with the facility (detail.access). Separate from Assigned staff: someone
 * can be assigned without PCC access, which is called out below the list. Passwords are never
 * loaded with the page; Reveal asks the API, which records it on the facility and the provider.
 */
export function FacilityAccessSection({ detail, onChanged }: { detail: FacilityDetail; onChanged: (pcc: FacilityAccess[]) => void }) {
  const roles = useRoles();
  const pcc = detail.access?.pcc ?? [];
  const [adding, setAdding] = useState(false);
  const withAccess = new Set(pcc.map((a) => a.staff.id));
  const assignedWithout = uniqueStaff(detail.assignments.map((a) => a.staff)).filter((s) => !withAccess.has(s.id));
  const replace = (next: FacilityAccess) => onChanged(pcc.some((a) => a.id === next.id) ? pcc.map((a) => (a.id === next.id ? next : a)) : [...pcc, next]);

  return (
    <ProfileSection
      title="Facility access"
      action={
        !adding && (
          <button type="button" className="text-link profile-section-link link-button" onClick={() => setAdding(true)}>
            + Add PCC access
          </button>
        )
      }
    >
      <h3 className="access-system">PointClickCare</h3>
      {pcc.length === 0 && !adding && <p className="profile-empty">No PCC access recorded for this facility.</p>}
      {pcc.length > 0 && (
        <ul className="login-rows">
          {pcc.map((a) => (
            <AccessRow key={a.id} access={a} linkStaff={canSee(roles, "employees")} onSaved={replace} />
          ))}
        </ul>
      )}
      {adding && (
        <AccessEditor
          facilityId={detail.facility.id}
          access={null}
          excluded={withAccess}
          suggested={assignedWithout}
          onCancel={() => setAdding(false)}
          onSaved={(a) => {
            replace(a);
            setAdding(false);
          }}
        />
      )}
      {assignedWithout.length > 0 && !adding && (
        <p className="profile-note">Assigned here without PCC access: {assignedWithout.map((s) => s.displayName).join(", ")}.</p>
      )}
      <p className="profile-note">Passwords are encrypted. Each reveal and change is recorded on this facility and the provider.</p>
    </ProfileSection>
  );
}

function uniqueStaff(list: { id: string; displayName: string }[]) {
  return [...new Map(list.map((s) => [s.id, s])).values()];
}

function AccessRow({ access: a, linkStaff, onSaved }: { access: FacilityAccess; linkStaff: boolean; onSaved: (a: FacilityAccess) => void }) {
  const [editing, setEditing] = useState(false);
  const secret = useRevealedSecret(() => revealFacilityAccessPassword(a.id));

  if (editing) {
    return (
      <li className="login-row">
        <AccessEditor
          facilityId={a.facility.id}
          access={a}
          excluded={new Set()}
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
        <span className="login-detail muted">
          {a.hasPassword ? `Password saved${a.passwordSetAt ? ` ${formatDate(a.passwordSetAt)}` : ""}${a.passwordSetBy ? ` by ${a.passwordSetBy}` : ""}` : "No password saved"}
          {!a.assigned && " · not currently assigned here"}
        </span>
        {a.notes && <span className="login-detail muted access-notes">{a.notes}</span>}
        <RevealedSecret secret={secret} />
      </div>
      <div className="login-actions">
        {a.hasPassword && secret.value === null && (
          <button type="button" className="button" onClick={secret.reveal} disabled={secret.busy}>
            {secret.busy ? "Revealing…" : "Reveal"}
          </button>
        )}
        <button type="button" className="button" onClick={() => setEditing(true)} disabled={secret.busy}>
          Edit
        </button>
      </div>
    </li>
  );
}

/** Add (access null) or edit one record. A new password is never pre-filled; blank keeps the saved one. */
function AccessEditor({
  facilityId,
  access,
  excluded,
  suggested,
  onCancel,
  onSaved,
}: {
  facilityId: string;
  access: FacilityAccess | null;
  excluded: Set<string>;
  suggested: { id: string; displayName: string }[];
  onCancel: () => void;
  onSaved: (a: FacilityAccess) => void;
}) {
  const [staffId, setStaffId] = useState(suggested[0]?.id ?? "");
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
    if (removePassword) values.password = null;
    else if (password) values.password = password; // never trimmed: spaces can be part of a password
    setBusy(true);
    setError(null);
    try {
      if (access) {
        // Send only what changed, so the activity lists real changes.
        const changes = Object.fromEntries(
          Object.entries(values).filter(([key, value]) => key === "password" || (access as unknown as Record<string, unknown>)[key] !== value),
        );
        onSaved((await updateFacilityAccess(access.id, changes)).access);
      } else {
        if (!staffId) {
          setError("Choose a provider.");
          setBusy(false);
          return;
        }
        onSaved(await createFacilityAccess({ ...values, staffId, facilityId, system: "pcc" }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setBusy(false);
    }
  }

  return (
    <form className="login-editor access-editor" onSubmit={submit} autoComplete="off">
      <span className="login-system">{access ? access.staff.displayName : "Add PCC access"}</span>
      <div className="login-editor-grid">
        {!access && <ProviderPicker id={`${idBase}-staff`} value={staffId} onChange={setStaffId} excluded={excluded} suggested={suggested} />}
        <div className="field">
          <label htmlFor={`${idBase}-org`}>Company / organization</label>
          <input id={`${idBase}-org`} value={organization} onChange={(e) => setOrganization(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${idBase}-user`}>PCC username / ID</label>
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
          {busy ? "Saving…" : access ? "Save" : "Add access"}
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
