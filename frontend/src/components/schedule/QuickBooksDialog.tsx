"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import {
  disconnectQuickBooks,
  linkQuickBooks,
  needsConnection,
  previewLines,
  previewNotes,
  previewQuickBooks,
  resultLine,
  sendToQuickBooks,
  startQuickBooksConnect,
  type QuickBooksPreview,
  type QuickBooksSendResult,
} from "@/lib/schedule/quickbooks";
import { weekLabel } from "@/lib/schedule/week";

/** An API failure as dialog state: "connect first" codes get the Connect panel. */
const failed = (error: unknown, fallback: string): State =>
  error instanceof ApiError && needsConnection(error.code) ? { status: "connect", message: error.message } : { status: "error", message: error instanceof ApiError ? error.message : fallback };

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  /** Not connected yet, or QuickBooks Time stopped accepting the connection. */
  | { status: "connect"; message: string; busy?: boolean }
  | { status: "ready"; preview: QuickBooksPreview }
  | { status: "sending"; preview: QuickBooksPreview }
  | { status: "sent"; result: QuickBooksSendResult };

/**
 * "Send to QuickBooks Time" for the week on the board. Opens with a preview from the ORCA API:
 * what will be added, updated and removed, and any provider or facility that still needs
 * matching to a QuickBooks Time user or jobcode (picked here). Nothing is sent until Send is
 * pressed, and new events arrive in QuickBooks Time as drafts.
 */
export function QuickBooksDialog({ weekStart, onClose }: { weekStart: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State>({ status: "loading" });

  // Asks the ORCA API what a send would do. State is only set once the answer is back.
  const fetchPreview = useCallback(
    () =>
      previewQuickBooks(weekStart).then(
        (preview) => setState({ status: "ready", preview }),
        (error) => setState(failed(error, "The preview couldn't be loaded.")),
      ),
    [weekStart],
  );
  const load = () => {
    setState({ status: "loading" });
    void fetchPreview();
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    void fetchPreview();
  }, [fetchPreview]);

  async function send(preview: QuickBooksPreview) {
    setState({ status: "sending", preview });
    try {
      setState({ status: "sent", result: await sendToQuickBooks(weekStart) });
    } catch (error) {
      setState(failed(error, "The schedule couldn't be sent."));
    }
  }

  async function connect() {
    setState((s) => (s.status === "connect" ? { ...s, busy: true } : s));
    try {
      // Off to QuickBooks Time's own approval page; it sends the admin back to the schedule.
      window.location.assign(await startQuickBooksConnect());
    } catch (error) {
      setState({ status: "error", message: error instanceof ApiError ? error.message : "Connecting couldn't be started." });
    }
  }

  async function disconnectNow() {
    if (!window.confirm("Disconnect QuickBooks Time? Events already sent stay there, but ORCA won't be able to send or update the schedule until someone connects again.")) return;
    try {
      await disconnectQuickBooks();
      setState({ status: "connect", message: "QuickBooks Time is disconnected." });
    } catch (error) {
      setState({ status: "error", message: error instanceof ApiError ? error.message : "Couldn't disconnect." });
    }
  }

  const preview = state.status === "ready" || state.status === "sending" ? state.preview : null;
  const sending = state.status === "sending";
  const lines = preview ? previewLines(preview.summary) : [];
  const notes = preview ? previewNotes(preview.summary) : [];

  return (
    <dialog ref={dialogRef} className="editor quickbooks" aria-labelledby="qb-title" onClose={onClose} onCancel={onClose}>
      <div className="quickbooks-body">
        <div className="editor-head">
          <h2 id="qb-title">Send to QuickBooks Time</h2>
          <button type="button" className="editor-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="quickbooks-week">{weekLabel(weekStart)}</p>

        {state.status === "loading" && <p className="muted">Checking QuickBooks Time…</p>}

        {state.status === "connect" && (
          <>
            <p>{state.message}</p>
            <p className="quickbooks-notes-text">
              You&apos;ll sign in to QuickBooks Time as an administrator and approve ORCA&apos;s access. That&apos;s needed once; ORCA keeps the connection renewed after that.
            </p>
            <div className="editor-actions">
              <span className="editor-actions-main">
                <button type="button" className="button" onClick={onClose} disabled={state.busy}>
                  Cancel
                </button>
                <button type="button" className="button button-primary-sm" onClick={connect} disabled={state.busy}>
                  {state.busy ? "Opening QuickBooks Time…" : "Connect QuickBooks Time"}
                </button>
              </span>
            </div>
          </>
        )}

        {state.status === "error" && (
          <>
            <div className="editor-feedback is-blocking" role="alert">
              <p>{state.message}</p>
            </div>
            <div className="editor-actions">
              <span className="editor-actions-main">
                <button type="button" className="button" onClick={onClose}>
                  Close
                </button>
                <button type="button" className="button button-primary-sm" onClick={load}>
                  Try again
                </button>
              </span>
            </div>
          </>
        )}

        {preview && (
          <>
            {lines.length > 0 ? (
              <ul className="quickbooks-lines">
                {lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p>{preview.summary.blocked > 0 ? "Nothing can be sent until the matches below are chosen." : "QuickBooks Time already matches this week. There's nothing to send."}</p>
            )}
            {notes.length > 0 && (
              <ul className="quickbooks-notes">
                {notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}

            {preview.unmatchedStaff.length > 0 && (
              <MatchList
                title="Providers not found in QuickBooks Time"
                hint="Choose each provider's QuickBooks Time user. It's remembered for next time."
                kind="staff"
                rows={preview.unmatchedStaff}
                options={preview.users.map((u) => ({ id: u.id, label: u.email ? `${u.name} (${u.email})` : u.name }))}
                disabled={sending}
                onLinked={load}
              />
            )}
            {preview.unmatchedFacilities.length > 0 && (
              <MatchList
                title="Facilities not found in QuickBooks Time"
                hint="Choose each facility's jobcode. The jobcode is what carries the facility's geofence."
                kind="facilities"
                rows={preview.unmatchedFacilities}
                options={preview.jobcodes.map((j) => ({ id: j.id, label: j.name }))}
                disabled={sending}
                onLinked={load}
              />
            )}

            <p className="quickbooks-foot">
              Goes to the &ldquo;{preview.calendar.name}&rdquo; calendar. New events are drafts: nobody is notified until you publish them in QuickBooks Time.
              {preview.lastSent && ` Last sent ${formatDate(preview.lastSent.at)} by ${preview.lastSent.by}.`}{" "}
              <button type="button" className="link-button quickbooks-disconnect" onClick={disconnectNow} disabled={sending}>
                Disconnect
              </button>
            </p>
            <div className="editor-actions">
              <span className="editor-actions-main">
                <button type="button" className="button" onClick={onClose} disabled={sending}>
                  Cancel
                </button>
                <button type="button" className="button button-primary-sm" onClick={() => send(preview)} disabled={sending || lines.length === 0}>
                  {sending ? "Sending…" : "Send as drafts"}
                </button>
              </span>
            </div>
          </>
        )}

        {state.status === "sent" && (
          <>
            <p role="status">{resultLine(state.result)}</p>
            {state.result.blocked > 0 && <p className="muted">{state.result.blocked} {state.result.blocked === 1 ? "entry is" : "entries are"} still waiting on a match and weren&apos;t sent.</p>}
            {state.result.failures.length > 0 && (
              <div className="editor-feedback is-blocking" role="alert">
                <p>QuickBooks Time refused {state.result.failures.length === 1 ? "one event" : `${state.result.failures.length} events`}. Everything else was sent; these will be tried again next time.</p>
                <ul>
                  {state.result.failures.slice(0, 8).map((f, i) => (
                    <li key={i}>
                      {f.date ? `${formatDate(f.date)}: ` : ""}
                      {f.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="editor-actions">
              <span className="editor-actions-main">
                <button type="button" className="button button-primary-sm" onClick={onClose}>
                  Done
                </button>
              </span>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}

function MatchList({
  title,
  hint,
  kind,
  rows,
  options,
  disabled,
  onLinked,
}: {
  title: string;
  hint: string;
  kind: "staff" | "facilities";
  rows: { id: string; name: string; entries: number }[];
  options: { id: number; label: string }[];
  disabled: boolean;
  onLinked: () => void;
}) {
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(recordId: string) {
    const value = Number(chosen[recordId]);
    if (!value) return;
    setBusy(recordId);
    setError(null);
    try {
      await linkQuickBooks(kind, recordId, value);
      onLinked();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The match couldn't be saved.");
      setBusy(null);
    }
  }

  return (
    <section className="quickbooks-match">
      <h3>{title}</h3>
      <p className="field-hint">{hint}</p>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <span className="quickbooks-match-name">
              {row.name} <span className="muted">· {row.entries} {row.entries === 1 ? "entry" : "entries"}</span>
            </span>
            <span className="quickbooks-match-pick">
              <select aria-label={`QuickBooks Time match for ${row.name}`} value={chosen[row.id] ?? ""} onChange={(e) => setChosen((c) => ({ ...c, [row.id]: e.target.value }))} disabled={disabled || busy !== null}>
                <option value="">Choose…</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button type="button" className="button" onClick={() => save(row.id)} disabled={disabled || busy !== null || !chosen[row.id]}>
                {busy === row.id ? "Saving…" : "Match"}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {error && (
        <p className="record-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
