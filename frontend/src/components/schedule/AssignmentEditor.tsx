"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createAssignment, deleteAssignment, ScheduleError, updateAssignment, type SaveResult } from "@/lib/schedule/api";
import { isProvider } from "@/lib/schedule/board";
import { facilityShort, TIME_LABELS, TYPE_LABELS } from "@/lib/schedule/format";
import { ASSIGNMENT_TYPES, TIME_BLOCKS, type Assignment, type AssignmentInput, type AssignmentType, type Issue, type ScheduleBoardData, type TimeBlock } from "@/lib/schedule/types";
import { dayHeading, isIsoDate } from "@/lib/schedule/week";
import type { NewEntryPrefill } from "./ScheduleBoard";

const NEEDS_FACILITY: AssignmentType[] = ["facility", "coverage"];
const NO_FACILITY: AssignmentType[] = ["pto", "off"];

interface FormState {
  staffId: string;
  date: string;
  type: AssignmentType;
  facilityId: string;
  coveringStaffId: string;
  timeBlock: TimeBlock;
  startTime: string;
  endTime: string;
  notes: string;
}

function initialForm(existing: Assignment | null, prefill: NewEntryPrefill | null): FormState {
  if (existing) {
    return {
      staffId: existing.staffId,
      date: existing.date,
      type: existing.type,
      facilityId: existing.facilityId ?? "",
      coveringStaffId: existing.coveringStaffId ?? "",
      timeBlock: existing.timeBlock,
      startTime: existing.startTime ?? "09:00",
      endTime: existing.endTime ?? "17:00",
      notes: existing.notes ?? "",
    };
  }
  return {
    staffId: prefill?.staffId ?? "",
    date: prefill?.date ?? "",
    type: prefill?.type ?? "facility",
    facilityId: prefill?.facilityId ?? "",
    coveringStaffId: prefill?.coveringStaffId ?? "",
    timeBlock: prefill?.timeBlock ?? "all_day",
    startTime: prefill?.startTime ?? "09:00",
    endTime: prefill?.endTime ?? "17:00",
    notes: prefill?.notes ?? "",
  };
}

function toInput(form: FormState): AssignmentInput {
  const custom = form.timeBlock === "custom";
  return {
    staffId: form.staffId,
    date: form.date,
    type: form.type,
    facilityId: NO_FACILITY.includes(form.type) ? null : form.facilityId || null,
    coveringStaffId: form.type === "coverage" ? form.coveringStaffId || null : null,
    timeBlock: form.timeBlock,
    startTime: custom ? form.startTime : null,
    endTime: custom ? form.endTime : null,
    notes: form.notes.trim() || null,
  };
}

/** Problems the form can see before asking the server, which checks everything again. */
function localProblems(form: FormState): string[] {
  const problems: string[] = [];
  if (!form.staffId) problems.push("Choose a provider.");
  if (!isIsoDate(form.date)) problems.push("Choose a date.");
  if (NEEDS_FACILITY.includes(form.type) && !form.facilityId) problems.push(`${TYPE_LABELS[form.type]} needs a facility.`);
  if (form.timeBlock === "custom" && !(form.startTime && form.endTime && form.endTime > form.startTime)) problems.push("The end time must be after the start time.");
  return problems;
}

type Feedback = { kind: "errors"; messages: string[] } | { kind: "conflicts"; issues: Issue[] } | { kind: "warnings"; issues: Issue[] } | null;

/**
 * Create or edit one schedule entry. Pickers list the canonical staff and facility records.
 * Conflicts are refused by the API; warnings are shown and saved only if the admin confirms.
 */
export function AssignmentEditor({
  data,
  existing,
  prefill,
  onClose,
  onSaved,
  onDeleted,
}: {
  data: ScheduleBoardData;
  existing: Assignment | null;
  prefill: NewEntryPrefill | null;
  onClose: () => void;
  onSaved: (result: SaveResult) => void;
  onDeleted: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<FormState>(() => initialForm(existing, prefill));
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFeedback(null);
    setConfirmingDelete(false);
  };

  // Separated staff are offered only when this entry already names them.
  const selectableStaff = data.staff
    .filter((s) => s.employmentStatus !== "separated" || s.id === existing?.staffId || s.id === existing?.coveringStaffId)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const providers = selectableStaff.filter(isProvider);
  const otherStaff = selectableStaff.filter((s) => !isProvider(s));
  const facilities = [...data.facilities].sort((a, b) => facilityShort(a).localeCompare(facilityShort(b)));
  const facilityOption = (f: (typeof facilities)[number]) =>
    `${f.abbreviation ? `${f.abbreviation} — ${f.name}` : f.name}${f.operationalStatus === "inactive" ? " (inactive)" : ""}`;

  async function save(confirmWarnings: boolean) {
    const problems = localProblems(form);
    if (problems.length > 0) {
      setFeedback({ kind: "errors", messages: problems });
      return;
    }
    setBusy(true);
    try {
      const input = { ...toInput(form), confirmWarnings };
      const result = existing ? await updateAssignment(existing.id, input) : await createAssignment(input);
      onSaved(result);
    } catch (error) {
      if (error instanceof ScheduleError && error.needsConfirmation) setFeedback({ kind: "warnings", issues: error.warnings });
      else if (error instanceof ScheduleError && error.conflicts.length > 0) setFeedback({ kind: "conflicts", issues: error.conflicts });
      else setFeedback({ kind: "errors", messages: error instanceof ScheduleError && error.errors.length > 0 ? error.errors : [error instanceof Error ? error.message : "Couldn't save."] });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setBusy(true);
    try {
      await deleteAssignment(existing.id);
      onDeleted();
    } catch (error) {
      setFeedback({ kind: "errors", messages: [error instanceof Error ? error.message : "Couldn't delete."] });
      setConfirmingDelete(false);
    } finally {
      setBusy(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void save(false);
  };

  const heading = existing ? "Edit entry" : "Add entry";
  const dateNote = isIsoDate(form.date) ? `${dayHeading(form.date).weekday}, ${dayHeading(form.date).day}` : null;
  const showFacility = !NO_FACILITY.includes(form.type);

  return (
    <dialog ref={dialogRef} className="editor" aria-labelledby="editor-title" onClose={onClose} onCancel={onClose}>
      <form onSubmit={onSubmit} noValidate>
        <div className="editor-head">
          <h2 id="editor-title">{heading}</h2>
          <button type="button" className="editor-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="field">
          <label htmlFor="ed-staff">Provider</label>
          <select id="ed-staff" value={form.staffId} onChange={(e) => set("staffId", e.target.value)} required autoFocus={!form.staffId}>
            <option value="">Choose…</option>
            <optgroup label="Providers">
              {providers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                  {s.credentials ? `, ${s.credentials}` : ""}
                </option>
              ))}
            </optgroup>
            {otherStaff.length > 0 && (
              <optgroup label="Other staff">
                {otherStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="ed-date">Date</label>
            <input id="ed-date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} required />
            {dateNote && <span className="field-hint">{dateNote}</span>}
          </div>
          <div className="field">
            <label htmlFor="ed-type">Type</label>
            <select
              id="ed-type"
              value={form.type}
              onChange={(e) => {
                const type = e.target.value as AssignmentType;
                set("type", type);
                // PTO and days off are usually the whole day.
                if (NO_FACILITY.includes(type) && form.timeBlock !== "custom") setForm((f) => ({ ...f, type, timeBlock: "all_day" }));
              }}
            >
              {ASSIGNMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {showFacility && (
          <div className="field">
            <label htmlFor="ed-facility">
              Facility{NEEDS_FACILITY.includes(form.type) ? "" : <span className="muted"> (optional)</span>}
            </label>
            <select id="ed-facility" value={form.facilityId} onChange={(e) => set("facilityId", e.target.value)} autoFocus={!!form.staffId && !form.facilityId}>
              <option value="">{NEEDS_FACILITY.includes(form.type) ? "Choose…" : "None"}</option>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {facilityOption(f)}
                </option>
              ))}
            </select>
          </div>
        )}

        {form.type === "coverage" && (
          <div className="field">
            <label htmlFor="ed-covering">
              Covering for <span className="muted">(optional)</span>
            </label>
            <select id="ed-covering" value={form.coveringStaffId} onChange={(e) => set("coveringStaffId", e.target.value)}>
              <option value="">Not specified</option>
              {providers
                .filter((s) => s.id !== form.staffId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
            </select>
          </div>
        )}

        <fieldset className="field">
          <legend>Time</legend>
          <div className="segmented" role="group" aria-label="Time">
            {TIME_BLOCKS.map((b) => (
              <button key={b} type="button" className="segment" aria-pressed={form.timeBlock === b} onClick={() => set("timeBlock", b)}>
                {TIME_LABELS[b]}
              </button>
            ))}
          </div>
          {form.timeBlock === "custom" && (
            <div className="field-row time-row">
              <label>
                <span className="sr-only">Start</span>
                <input type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} aria-label="Start time" />
              </label>
              <span className="muted">to</span>
              <label>
                <span className="sr-only">End</span>
                <input type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} aria-label="End time" />
              </label>
            </div>
          )}
        </fieldset>

        <div className="field">
          <label htmlFor="ed-notes">
            Notes <span className="muted">(optional)</span>
          </label>
          <textarea id="ed-notes" rows={2} maxLength={500} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          <span className="field-hint">Operational notes only. No patient information.</span>
        </div>

        {feedback && (
          <div className={`editor-feedback${feedback.kind === "warnings" ? "" : " is-blocking"}`} role="alert">
            {feedback.kind === "errors" && feedback.messages.map((m) => <p key={m}>{m}</p>)}
            {feedback.kind === "conflicts" && (
              <>
                <p className="feedback-title">This can&apos;t be saved:</p>
                <ul>
                  {feedback.issues.map((i, n) => (
                    <li key={n}>{i.message}</li>
                  ))}
                </ul>
              </>
            )}
            {feedback.kind === "warnings" && (
              <>
                <p className="feedback-title">Please check before saving:</p>
                <ul>
                  {feedback.issues.map((i, n) => (
                    <li key={n}>{i.message}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <div className="editor-actions">
          {existing &&
            (confirmingDelete ? (
              <span className="delete-confirm">
                Delete this entry?{" "}
                <button type="button" className="button button-danger" onClick={remove} disabled={busy}>
                  Delete
                </button>{" "}
                <button type="button" className="button" onClick={() => setConfirmingDelete(false)} disabled={busy}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" className="button button-quiet" onClick={() => setConfirmingDelete(true)} disabled={busy}>
                Delete
              </button>
            ))}
          <span className="editor-actions-main">
            <button type="button" className="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            {feedback?.kind === "warnings" ? (
              <button type="button" className="button button-primary-sm" onClick={() => save(true)} disabled={busy}>
                {busy ? "Saving…" : "Save anyway"}
              </button>
            ) : (
              <button type="submit" className="button button-primary-sm" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            )}
          </span>
        </div>
      </form>
    </dialog>
  );
}
