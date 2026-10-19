"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SearchPicker } from "@/components/SearchPicker";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { listFacilities, listStaff } from "@/lib/org/api";
import { linkQuickBooks, needsConnection, pullFromQuickBooks, pullLines, startQuickBooksConnect, type PullResult } from "@/lib/schedule/quickbooks";
import type { PickerOption } from "@/lib/search";

type State = { status: "pulling" } | { status: "done"; result: PullResult } | { status: "error"; message: string; connect: boolean };

/**
 * Update from QuickBooks Time: pulls its schedule (from the week on the board, five weeks) onto the
 * board and publishes it to the portal. Then says what changed, and lists anything in QuickBooks
 * Time ORCA can't place: a user who isn't linked to an employee, or a jobcode that isn't linked to
 * a facility. Linking one (best guess preselected) is remembered; Update again brings those events in.
 */
export function PullDialog({ weekStart, onClose }: { weekStart: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State>({ status: "pulling" });
  // One pull per opening: it changes the board, so it must not run twice (React re-runs effects in development).
  const started = useRef(false);

  const pull = useCallback(
    () =>
      pullFromQuickBooks(weekStart).then(
        (result) => setState({ status: "done", result }),
        (error) =>
          setState({
            status: "error",
            message: error instanceof ApiError ? error.message : "QuickBooks Time couldn't be read.",
            connect: error instanceof ApiError && needsConnection(error.code),
          }),
      ),
    [weekStart],
  );
  const again = () => {
    setState({ status: "pulling" });
    void pull();
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    if (started.current) return;
    started.current = true;
    void pull();
  }, [pull]);

  const result = state.status === "done" ? state.result : null;
  return (
    <dialog ref={dialogRef} className="editor quickbooks" aria-labelledby="pull-title" onClose={onClose} onCancel={onClose}>
      <div className="quickbooks-body">
        <div className="editor-head">
          <h2 id="pull-title">Update from QuickBooks Time</h2>
          <button type="button" className="editor-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {state.status === "pulling" && <p className="muted">Reading the schedule from QuickBooks Time…</p>}

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
                {state.connect ? (
                  <button type="button" className="button button-primary-sm" onClick={async () => window.location.assign(await startQuickBooksConnect())}>
                    Connect QuickBooks Time
                  </button>
                ) : (
                  <button type="button" className="button button-primary-sm" onClick={again}>
                    Try again
                  </button>
                )}
              </span>
            </div>
          </>
        )}

        {result && (
          <>
            <p className="quickbooks-week">
              {formatDate(result.from)} – {formatDate(result.to)}
            </p>
            <ul className="quickbooks-lines">
              {pullLines(result).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>

            {result.unmatchedUsers.length > 0 && (
              <LinkList
                title="QuickBooks Time users not linked to an employee"
                hint="Their events aren't on the board yet. Choose who each one is; it's remembered, then Update again."
                kind="staff"
                rows={result.unmatchedUsers}
                load={() => listStaff().then((list) => list.filter((s) => s.employmentStatus !== "separated").map((s) => ({ id: s.id, label: s.displayName })))}
                placeholder="Search employees…"
              />
            )}
            {result.unmatchedJobcodes.length > 0 && (
              <LinkList
                title="Jobcodes not linked to a facility"
                hint="Choose the facility each jobcode is for (or name the jobcode PTO, Off, Admin or Clinic in QuickBooks Time). Then Update again."
                kind="facilities"
                rows={result.unmatchedJobcodes}
                load={() => listFacilities().then((list) => list.filter((f) => !f.archivedAt).map((f) => ({ id: f.id, label: f.name, detail: f.abbreviation, keywords: [f.abbreviation ?? ""] })))}
                placeholder="Search facilities…"
              />
            )}
            {result.noJobcode > 0 && (
              <p className="quickbooks-notes-text">
                {result.noJobcode} {result.noJobcode === 1 ? "event has" : "events have"} no jobcode in QuickBooks Time, so there&apos;s no telling where {result.noJobcode === 1 ? "it is" : "they are"}. Give{" "}
                {result.noJobcode === 1 ? "it" : "them"} a jobcode there.
              </p>
            )}
            {result.overlaps.length > 0 && (
              <section className="quickbooks-match">
                <h3>Overlaps in QuickBooks Time</h3>
                <p className="field-hint">These are on the board as QuickBooks Time has them. Fix them there if they&apos;re mistakes.</p>
                <ul className="quickbooks-overlaps">
                  {result.overlaps.slice(0, 12).map((o, i) => (
                    <li key={i}>
                      {o.staff}, {formatDate(o.date)}: {o.message}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="editor-actions">
              <span className="editor-actions-main">
                {(result.unmatchedUsers.length > 0 || result.unmatchedJobcodes.length > 0) && (
                  <button type="button" className="button" onClick={again}>
                    Update again
                  </button>
                )}
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

function LinkList({
  title,
  hint,
  kind,
  rows,
  load,
  placeholder,
}: {
  title: string;
  hint: string;
  kind: "staff" | "facilities";
  rows: { id: number; name: string; events: number; suggestion: { id: string; name: string } | null }[];
  load: () => Promise<PickerOption[]>;
  placeholder: string;
}) {
  // Best guesses preselected; each is saved only when Link is pressed.
  const [chosen, setChosen] = useState<Record<number, { id: string; label: string }>>(() =>
    Object.fromEntries(rows.filter((r) => r.suggestion).map((r) => [r.id, { id: r.suggestion!.id, label: r.suggestion!.name }])),
  );
  const [linked, setLinked] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function link(qbtId: number) {
    const pick = chosen[qbtId];
    if (!pick) return;
    setBusy(qbtId);
    setError(null);
    try {
      await linkQuickBooks(kind, pick.id, qbtId);
      setLinked((l) => ({ ...l, [qbtId]: true }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The link couldn't be saved.");
    } finally {
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
              {row.name} <span className="muted">· {row.events} {row.events === 1 ? "event" : "events"}</span>
              {row.suggestion && !linked[row.id] && <span className="quickbooks-match-why">Suggested: {row.suggestion.name}</span>}
              {linked[row.id] && <span className="quickbooks-match-why">Linked to {chosen[row.id]?.label}. Update again to bring the events in.</span>}
            </span>
            {!linked[row.id] && (
              <span className="quickbooks-match-pick">
                <SearchPicker
                  ariaLabel={`Match for ${row.name}`}
                  value={chosen[row.id]?.id ?? null}
                  valueLabel={chosen[row.id]?.label}
                  placeholder={placeholder}
                  load={load}
                  disabled={busy !== null}
                  onChange={(o) => setChosen((c) => ({ ...c, [row.id]: { id: o.id, label: o.label } }))}
                />
                <button type="button" className="button" onClick={() => link(row.id)} disabled={busy !== null || !chosen[row.id]}>
                  {busy === row.id ? "Linking…" : row.suggestion && chosen[row.id]?.id === row.suggestion.id ? "Confirm" : "Link"}
                </button>
              </span>
            )}
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
