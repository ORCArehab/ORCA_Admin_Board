"use client";

import { useEffect, useState, type FormEvent } from "react";
import { formatDate } from "@/lib/format";
import { getLogins, LOGIN_SYSTEMS, revealLoginPassword, saveLogin, type LoginSummary, type LoginSystem } from "@/lib/org/api";
import { staffCredentialing } from "@/lib/org/profile";
import type { Staff } from "@/lib/org/types";
import { useOrgResource } from "@/lib/org/useOrgResource";
import { DetailList, ProfileSection } from "./ProfileParts";

/** How long a revealed password stays on screen. */
const REVEAL_SECONDS = 30;

/**
 * Credentialing: NPI, CAQH Provider ID, and the CAQH ProView / NPPES / PECOS logins (HR and
 * ADMIN). It loads on its own, so a vault problem only affects this section. Passwords are never
 * loaded with the page: "Reveal" asks the ORCA API for one, which records who revealed it.
 */
export function EmployeeCredentialing({ staff }: { staff: Staff }) {
  const state = useOrgResource(() => getLogins(staff.id), [staff.id]);
  const identifiers = staffCredentialing(staff);

  return (
    <ProfileSection title="Credentialing">
      {identifiers.length > 0 && <DetailList items={identifiers} />}
      <div className="logins">
        {state.status === "loading" && <p className="profile-empty">Loading logins…</p>}
        {state.status === "error" && <p className="profile-empty">{state.error.isAuthError ? state.error.message : "Logins couldn't be loaded. Try again in a moment."}</p>}
        {state.status === "ready" && (
          <>
            {!state.data.vaultConfigured && (
              <p className="profile-note profile-note-lead">Password storage isn&apos;t set up yet. Usernames can be saved now; passwords once it is.</p>
            )}
            <ul className="login-rows">
              {LOGIN_SYSTEMS.map((s) => (
                <LoginRow
                  key={s.key}
                  staffId={staff.id}
                  system={s.key}
                  label={s.label}
                  login={state.data.logins.find((l) => l.system === s.key) ?? null}
                  vaultConfigured={state.data.vaultConfigured}
                  onSaved={(logins) => state.replace((d) => ({ ...d, logins }))}
                />
              ))}
            </ul>
            <p className="profile-note">Passwords are encrypted. Each reveal and change is recorded in this employee&apos;s activity.</p>
          </>
        )}
      </div>
    </ProfileSection>
  );
}

export function LoginRow({
  staffId,
  system,
  label,
  login,
  vaultConfigured,
  onSaved,
}: {
  staffId: string;
  system: LoginSystem;
  label: string;
  login: LoginSummary | null;
  vaultConfigured: boolean;
  onSaved: (logins: LoginSummary[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // A revealed password disappears on its own.
  useEffect(() => {
    if (revealed === null) return;
    const timer = window.setTimeout(() => {
      if (secondsLeft <= 1) setRevealed(null);
      else setSecondsLeft(secondsLeft - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [revealed, secondsLeft]);

  async function reveal() {
    setBusy(true);
    setMessage(null);
    try {
      setRevealed(await revealLoginPassword(staffId, system));
      setSecondsLeft(REVEAL_SECONDS);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The password couldn't be revealed.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (revealed === null) return;
    try {
      await navigator.clipboard.writeText(revealed);
      setMessage("Copied.");
    } catch {
      setMessage("Couldn't copy. Select the password instead.");
    }
  }

  if (editing) {
    return (
      <li className="login-row">
        <LoginEditor
          label={label}
          login={login}
          vaultConfigured={vaultConfigured}
          onCancel={() => setEditing(false)}
          onSave={async (change) => {
            const result = await saveLogin(staffId, system, change);
            onSaved(result.logins);
            setEditing(false);
            setRevealed(null);
            setMessage(result.changed.length ? "Saved." : "No changes.");
          }}
        />
      </li>
    );
  }

  return (
    <li className="login-row">
      <div className="login-main">
        <span className="login-system">{label}</span>
        <span className="login-detail">
          {login?.username ? <span className="login-username">{login.username}</span> : <span className="muted">No username</span>}
          <span className="muted">
            {" · "}
            {login?.hasPassword
              ? `Password saved${login.passwordSetAt ? ` ${formatDate(login.passwordSetAt)}` : ""}${login.passwordSetBy ? ` by ${login.passwordSetBy}` : ""}`
              : "No password saved"}
          </span>
        </span>
        {revealed !== null && (
          <span className="login-revealed">
            <code>{revealed}</code>
            <button type="button" className="button button-quiet" onClick={copy}>
              Copy
            </button>
            <button type="button" className="button button-quiet" onClick={() => setRevealed(null)}>
              Hide
            </button>
            <span className="muted">Hides in {secondsLeft}s</span>
          </span>
        )}
        {message && (
          <span className="login-message" role="status">
            {message}
          </span>
        )}
      </div>
      <div className="login-actions">
        {login?.hasPassword && revealed === null && vaultConfigured && (
          <button type="button" className="button" onClick={reveal} disabled={busy}>
            {busy ? "Revealing…" : "Reveal"}
          </button>
        )}
        <button type="button" className="button" onClick={() => setEditing(true)} disabled={busy}>
          Edit
        </button>
      </div>
    </li>
  );
}

function LoginEditor({
  label,
  login,
  vaultConfigured,
  onCancel,
  onSave,
}: {
  label: string;
  login: LoginSummary | null;
  vaultConfigured: boolean;
  onCancel: () => void;
  onSave: (change: { username?: string | null; password?: string | null }) => Promise<void>;
}) {
  const [username, setUsername] = useState(login?.username ?? "");
  const [password, setPassword] = useState("");
  const [removePassword, setRemovePassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = `login-${label.replace(/\W/g, "").toLowerCase()}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const change: { username?: string | null; password?: string | null } = {};
    const trimmed = username.trim();
    if (trimmed !== (login?.username ?? "")) change.username = trimmed || null;
    if (removePassword) change.password = null;
    else if (password) change.password = password; // never trimmed: spaces can be part of a password
    if (Object.keys(change).length === 0) {
      onCancel();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(change);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setBusy(false);
    }
  }

  return (
    <form className="login-editor" onSubmit={submit} autoComplete="off">
      <span className="login-system">{label}</span>
      <div className="login-editor-grid">
        <div className="field">
          <label htmlFor={`${id}-user`}>Username</label>
          <input id={`${id}-user`} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" spellCheck={false} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-pass`}>{login?.hasPassword ? "New password" : "Password"}</label>
          <input
            id={`${id}-pass`}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder={login?.hasPassword ? "Leave blank to keep the saved one" : ""}
            disabled={!vaultConfigured || removePassword}
            aria-describedby={!vaultConfigured ? `${id}-pass-hint` : undefined}
          />
          {!vaultConfigured && (
            <span className="field-hint" id={`${id}-pass-hint`}>
              Password storage isn&apos;t set up yet.
            </span>
          )}
        </div>
      </div>
      {login?.hasPassword && (
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
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
