"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createAssignment, ScheduleError, type SaveResult } from "@/lib/schedule/api";
import { facilityShort, TIME_LABELS, TYPE_LABELS } from "@/lib/schedule/format";
import { buildQuickInput, DEFAULT_CHOICES, type QuickChoices, type QuickContext } from "@/lib/schedule/quickAdd";
import { facilityOptions, specialOptions, staffOptions, SPECIAL_TYPES, type SearchOption } from "@/lib/schedule/search";
import type { Issue, ScheduleBoardData, TimeBlock } from "@/lib/schedule/types";
import { dayHeading } from "@/lib/schedule/week";
import { Combobox } from "./Combobox";
import type { NewEntryPrefill } from "./ScheduleBoard";

const QUICK_TIMES: TimeBlock[] = ["all_day", "am", "pm"];
const QUICK_TYPES: QuickChoices["type"][] = ["facility", "coverage", "admin", "clinic"];

type Feedback = { kind: "errors"; messages: string[] } | { kind: "conflicts"; issues: Issue[] } | { kind: "warnings"; issues: Issue[] } | null;

/**
 * Quick add, opened from an empty cell. The cell already gives the date and the row's provider
 * or facility, so it asks only for the other: type part of a name, press Enter, and the entry is
 * created. Time, type, coverage and notes are one step away under "More options"; the full form
 * stays available for anything unusual.
 */
export function QuickAdd({
  data,
  context,
  anchor,
  onClose,
  onCreated,
  onOpenFullForm,
}: {
  data: ScheduleBoardData;
  context: QuickContext;
  /** The cell's add button: the panel sits next to it, and focus goes back to it on close. */
  anchor: HTMLElement;
  onClose: () => void;
  onCreated: (result: SaveResult) => void;
  onOpenFullForm: (prefill: NewEntryPrefill) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [pick, setPick] = useState<SearchOption | null>(null);
  const [choices, setChoices] = useState<QuickChoices>(DEFAULT_CHOICES);
  const [more, setMore] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const facilityView = !!context.facilityId;
  const facility = context.facilityId ? data.facilities.find((f) => f.id === context.facilityId) : undefined;
  const provider = context.staffId ? data.staff.find((s) => s.id === context.staffId) : undefined;
  const day = dayHeading(context.date);
  const heading = `${facilityView ? facilityShort(facility) : (provider?.displayName ?? "Provider")} · ${day.weekday} ${day.day}`;

  const options = useMemo(
    () => (facilityView ? staffOptions(data.staff) : [...facilityOptions(data.facilities), ...specialOptions()]),
    [facilityView, data.staff, data.facilities],
  );
  const coveringOptions = useMemo(() => staffOptions(data.staff, pick?.kind === "staff" ? pick.id : context.staffId), [data.staff, pick, context.staffId]);
  const coveringPick = choices.coveringStaffId ? (coveringOptions.find((o) => o.id === choices.coveringStaffId) ?? null) : null;

  // Sit just below the cell (above it near the bottom of the window), and follow it on scroll.
  useLayoutEffect(() => {
    function place() {
      const rect = anchor.closest("td")?.getBoundingClientRect() ?? anchor.getBoundingClientRect();
      const panel = panelRef.current;
      const width = panel?.offsetWidth ?? 320;
      const height = panel?.offsetHeight ?? 160;
      const below = rect.bottom + 4;
      const top = below + height > window.innerHeight - 8 && rect.top - height - 4 > 8 ? rect.top - height - 4 : below;
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      setPosition({ top, left });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, more, feedback]);

  // A click anywhere else closes it, like leaving a spreadsheet cell.
  useEffect(() => {
    function outside(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node) && !busy) onClose();
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [onClose, busy]);

  // Focus the box once the panel is placed: it's hidden while measuring, and a hidden input can't take focus.
  const placed = position !== null;
  useEffect(() => {
    if (placed) inputRef.current?.focus();
  }, [placed]);

  // Warnings: focus "Add anyway", so Enter confirms. A clash or error: leave it open with the name
  // selected, so a different one can be typed straight over it.
  useEffect(() => {
    if (feedback?.kind === "warnings") confirmRef.current?.focus();
    else if (feedback) inputRef.current?.select();
  }, [feedback]);

  const setChoice = <K extends keyof QuickChoices>(key: K, value: QuickChoices[K]) => {
    setChoices((c) => ({ ...c, [key]: value }));
    setFeedback(null);
  };

  async function submit(target: SearchOption | null, confirmWarnings = false) {
    if (!target || busy) return;
    const built = buildQuickInput(context, target, choices);
    if (!built.ok) {
      setFeedback({ kind: "errors", messages: [built.message] });
      return;
    }
    setBusy(true);
    try {
      onCreated(await createAssignment({ ...built.input, confirmWarnings }));
    } catch (error) {
      if (error instanceof ScheduleError && error.needsConfirmation) setFeedback({ kind: "warnings", issues: error.warnings });
      else if (error instanceof ScheduleError && error.conflicts.length > 0) setFeedback({ kind: "conflicts", issues: error.conflicts });
      else setFeedback({ kind: "errors", messages: error instanceof ScheduleError && error.errors.length > 0 ? error.errors : [error instanceof Error ? error.message : "Couldn't add this."] });
    } finally {
      setBusy(false);
    }
  }

  function onPick(option: SearchOption | null) {
    const again = !!option && !!pick && option.kind === pick.kind && option.id === pick.id;
    setPick(option);
    setFeedback(null);
    // The common case: picking is adding. With More options open, picking fills the box and
    // Enter (or Add) adds, so the other fields can be set in either order.
    if (option && (!more || again)) void submit(option, again && feedback?.kind === "warnings");
  }

  function openFullForm() {
    const target = pick;
    onOpenFullForm({
      date: context.date,
      staffId: context.staffId ?? (target?.kind === "staff" ? target.id : undefined),
      facilityId: context.facilityId ?? (target?.kind === "facility" ? target.id : undefined),
      type: target?.kind === "special" ? (target.id as NewEntryPrefill["type"]) : choices.type,
      timeBlock: choices.timeBlock,
      startTime: choices.startTime,
      endTime: choices.endTime,
      coveringStaffId: choices.coveringStaffId ?? undefined,
      notes: choices.notes,
    });
  }

  return (
    <div
      ref={panelRef}
      className="quick"
      role="dialog"
      aria-label={`Add entry: ${heading}`}
      style={position ? { top: position.top, left: position.left } : { visibility: "hidden" }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="quick-head">
        <span className="quick-context">{heading}</span>
        <button type="button" className="editor-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <Combobox
        label={facilityView ? "Provider" : "Facility"}
        placeholder={facilityView ? "Provider — type a name" : "Facility — or PTO, Off, Admin, Clinic"}
        options={options}
        value={pick}
        onPick={onPick}
        onEscape={onClose}
        inputRef={inputRef}
      />

      <div className="quick-row">
        <div className="segmented" role="group" aria-label="Time">
          {QUICK_TIMES.map((b) => (
            <button key={b} type="button" className="segment" aria-pressed={choices.timeBlock === b} onClick={() => setChoice("timeBlock", b)}>
              {TIME_LABELS[b]}
            </button>
          ))}
          {choices.timeBlock === "custom" && (
            <button type="button" className="segment" aria-pressed="true" onClick={() => setMore(true)}>
              Custom
            </button>
          )}
        </div>
        <button type="button" className="quick-more" aria-expanded={more} aria-controls="quick-more" onClick={() => setMore((m) => !m)}>
          More options
        </button>
      </div>

      {!facilityView && !more && (
        <div className="quick-shortcuts" role="group" aria-label="Not at a facility">
          {SPECIAL_TYPES.map((t) => (
            <button key={t} type="button" className="quick-shortcut" disabled={busy} onClick={() => onPick(specialOptions().find((o) => o.id === t)!)}>
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      )}

      {more && (
        <div className="quick-options" id="quick-more">
          <div className="field">
            <span className="quick-label">Type</span>
            <div className="segmented" role="group" aria-label="Type">
              {QUICK_TYPES.map((t) => (
                <button key={t} type="button" className="segment" aria-pressed={choices.type === t} onClick={() => setChoice("type", t)}>
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            {!facilityView && <span className="field-hint">For PTO or a day off, type it in the facility box.</span>}
          </div>

          {choices.type === "coverage" && (
            <div className="field">
              <span className="quick-label">Covering for (optional)</span>
              <Combobox label="Covering for" placeholder="Provider being covered" options={coveringOptions} value={coveringPick} onPick={(o) => setChoice("coveringStaffId", o?.id ?? null)} limit={6} />
            </div>
          )}

          <div className="field">
            <label className="check">
              <input
                type="checkbox"
                checked={choices.timeBlock === "custom"}
                onChange={(e) => setChoice("timeBlock", e.target.checked ? "custom" : "all_day")}
              />
              Custom hours
            </label>
            {choices.timeBlock === "custom" && (
              <div className="time-row">
                <input type="time" value={choices.startTime} onChange={(e) => setChoice("startTime", e.target.value)} aria-label="Start time" />
                <span className="muted">to</span>
                <input type="time" value={choices.endTime} onChange={(e) => setChoice("endTime", e.target.value)} aria-label="End time" />
              </div>
            )}
          </div>

          <div className="field">
            <label className="quick-label" htmlFor="quick-notes">
              Notes (optional)
            </label>
            <input id="quick-notes" type="text" maxLength={500} value={choices.notes} onChange={(e) => setChoice("notes", e.target.value)} placeholder="Operational notes only. No patient information." />
          </div>

          <div className="quick-actions">
            <button type="button" className="text-link quick-full" onClick={openFullForm}>
              Open full form…
            </button>
            <button type="button" className="button button-primary-sm" disabled={!pick || busy} onClick={() => submit(pick)}>
              {busy ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <div className={`editor-feedback quick-feedback${feedback.kind === "warnings" ? "" : " is-blocking"}`} role="alert">
          {feedback.kind === "errors" && feedback.messages.map((m) => <p key={m}>{m}</p>)}
          {feedback.kind !== "errors" && (
            <>
              <p className="feedback-title">{feedback.kind === "conflicts" ? "Not added — this clashes:" : "Check before adding:"}</p>
              <ul>
                {feedback.issues.map((i, n) => (
                  <li key={n}>{i.message}</li>
                ))}
              </ul>
            </>
          )}
          {feedback.kind === "warnings" && (
            <div className="quick-confirm">
              <button ref={confirmRef} type="button" className="button button-primary-sm" onClick={() => submit(pick, true)} disabled={busy}>
                {busy ? "Adding…" : "Add anyway"}
              </button>
              <button type="button" className="button" onClick={() => { setFeedback(null); inputRef.current?.select(); }} disabled={busy}>
                Change
              </button>
            </div>
          )}
        </div>
      )}

      {busy && !more && feedback === null && (
        <p className="quick-status" role="status">
          Adding…
        </p>
      )}
    </div>
  );
}
