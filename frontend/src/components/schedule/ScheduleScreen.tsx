"use client";

import { useEffect, useState } from "react";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { copyWeek, createAssignment, deleteAssignment, ScheduleError, updateAssignment, type SaveResult } from "@/lib/schedule/api";
import { isProvider, type BoardFilters } from "@/lib/schedule/board";
import { copyInput, planDrop, type DropTarget } from "@/lib/schedule/dragDrop";
import { facilityShort, TYPE_LABELS } from "@/lib/schedule/format";
import type { Assignment, AssignmentInput, FacilityRecord, Issue, ScheduleBoardData, StaffRecord } from "@/lib/schedule/types";
import { useScheduleBoard } from "@/lib/schedule/useScheduleBoard";
import { addDays, dayHeading, weekLabel, weekStart as weekStartOf } from "@/lib/schedule/week";
import { AssignmentEditor } from "./AssignmentEditor";
import { QuickAdd } from "./QuickAdd";
import { ScheduleBoard, type BoardView, type NewEntryPrefill } from "./ScheduleBoard";

type Editing = { existing: Assignment; prefill: null } | { existing: null; prefill: NewEntryPrefill } | null;
type Quick = { prefill: NewEntryPrefill; anchor: HTMLElement } | null;
type Toast = { message: string; undo?: () => Promise<unknown> } | null;
/** A move or copy the API wants confirmed (warnings), or refused (conflicts). */
type DropIssue = { entry: Assignment; input: AssignmentInput; copy: boolean; kind: "warnings" | "conflicts"; issues: Issue[] } | null;

const toInput = (a: Assignment): AssignmentInput => copyInput(a, {});

/** Adds or replaces entries (and any staff or facility they bring) in the board's data. */
function withEntries(data: ScheduleBoardData, result: SaveResult & { staff?: StaffRecord[]; facilities?: FacilityRecord[] }): ScheduleBoardData {
  const inWeek = result.assignment.date >= data.from && result.assignment.date <= data.to;
  const others = data.assignments.filter((a) => a.id !== result.assignment.id);
  return {
    ...data,
    assignments: inWeek ? [...others, result.assignment] : others,
    staff: [...data.staff, ...(result.staff ?? []).filter((s) => !data.staff.some((x) => x.id === s.id))],
    facilities: [...data.facilities, ...(result.facilities ?? []).filter((f) => !data.facilities.some((x) => x.id === f.id))],
  };
}

/** Operations scheduling: the weekly board, its filters, and the entry editor. */
export function ScheduleScreen({ today, initialWeekStart, initialView }: { today: string; initialWeekStart: string; initialView: BoardView }) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [view, setView] = useState<BoardView>(initialView);
  const [filters, setFilters] = useState<BoardFilters>({ search: "", staffId: null, facilityId: null, showAll: false });
  const [editing, setEditing] = useState<Editing>(null);
  const [quick, setQuick] = useState<Quick>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [dropIssue, setDropIssue] = useState<DropIssue>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const board = useScheduleBoard(weekStart);
  const thisWeek = weekStartOf(today);

  // Keep the address shareable: the week and view in the query string.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("week", weekStart);
    if (view === "facilities") url.searchParams.set("view", view);
    else url.searchParams.delete("view");
    window.history.replaceState(window.history.state, "", url);
  }, [weekStart, view]);

  const goTo = (start: string) => {
    setWeekStart(start);
    setNotice(null);
    setQuick(null);
    setDropIssue(null);
  };

  // Toasts fade on their own; a newer one replaces the last.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.undo ? 8000 : 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function describe(a: Assignment) {
    const data = board.status === "ready" ? board.data : null;
    const person = data?.staff.find((s) => s.id === a.staffId)?.displayName ?? "Entry";
    const place = a.facilityId ? facilityShort(data?.facilities.find((f) => f.id === a.facilityId)) : TYPE_LABELS[a.type];
    const day = dayHeading(a.date);
    return `${person} · ${place} · ${day.weekday} ${day.day}`;
  }

  function closeQuick(returnFocus = true) {
    const anchor = quick?.anchor;
    setQuick(null);
    if (returnFocus && anchor?.isConnected) anchor.focus();
  }

  function quickAdded(result: SaveResult) {
    closeQuick();
    board.update((d) => withEntries(d, result));
    board.reload();
    setToast({
      message: `Added ${describe(result.assignment)}${result.warnings.length ? ` (with ${result.warnings.length === 1 ? "a warning" : "warnings"})` : ""}`,
      undo: () => deleteAssignment(result.assignment.id),
    });
  }

  async function undo() {
    const action = toast?.undo;
    setToast(null);
    if (!action) return;
    try {
      await action();
      board.reload();
      setToast({ message: "Undone." });
    } catch (error) {
      setToast({ message: error instanceof Error ? `Couldn't undo: ${error.message}` : "Couldn't undo." });
    }
  }

  /** Drop = move (PATCH) or, with Alt/Option, copy (POST), through the same API and clash checks as the editor. */
  async function dropped(entry: Assignment, target: DropTarget, copy: boolean, confirmWarnings = false, prepared?: AssignmentInput) {
    let input = prepared;
    if (!input) {
      const plan = planDrop(entry, target);
      if (plan.kind === "none") return;
      if (plan.kind === "invalid") {
        setToast({ message: plan.message });
        return;
      }
      input = copyInput(entry, plan.changes);
    }
    setDropIssue(null);
    try {
      const result = copy ? await createAssignment({ ...input, confirmWarnings }) : await updateAssignment(entry.id, { ...input, confirmWarnings });
      board.update((d) => withEntries(d, result));
      board.reload();
      const before = toInput(entry);
      setToast({
        message: `${copy ? "Copied" : "Moved"} ${describe(result.assignment)}`,
        undo: copy ? () => deleteAssignment(result.assignment.id) : () => updateAssignment(entry.id, { ...before, confirmWarnings: true }),
      });
    } catch (error) {
      if (error instanceof ScheduleError && error.needsConfirmation) setDropIssue({ entry, input, copy, kind: "warnings", issues: error.warnings });
      else if (error instanceof ScheduleError && error.conflicts.length > 0) setDropIssue({ entry, input, copy, kind: "conflicts", issues: error.conflicts });
      else setToast({ message: `Couldn't ${copy ? "copy" : "move"} it: ${error instanceof ScheduleError && error.errors.length ? error.errors.join(" ") : error instanceof Error ? error.message : "unknown error"}` });
    }
  }

  function saved(result: SaveResult) {
    setEditing(null);
    setNotice(result.warnings.length > 0 ? `Saved with ${result.warnings.length === 1 ? "a warning" : "warnings"}: ${result.warnings.map((w) => w.message).join(" ")}` : null);
    board.reload();
  }

  async function copyPreviousWeek() {
    const from = addDays(weekStart, -7);
    if (!window.confirm(`Copy ${weekLabel(from)} into ${weekLabel(weekStart)}? Only days a provider has nothing scheduled are filled; nothing is overwritten.`)) return;
    setCopying(true);
    try {
      const result = await copyWeek(from, weekStart);
      setNotice(
        result.copied === 0 && result.skipped.length === 0
          ? "The previous week has no entries to copy."
          : `Copied ${result.copied} ${result.copied === 1 ? "entry" : "entries"}${result.skipped.length ? `; skipped ${result.skipped.length} on days that already had entries` : ""}.`,
      );
      board.reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Couldn't copy the previous week.");
    } finally {
      setCopying(false);
    }
  }

  const data = board.status === "ready" ? board.data : null;
  const providers = data ? data.staff.filter((s) => isProvider(s) && s.employmentStatus !== "separated").sort((a, b) => a.displayName.localeCompare(b.displayName)) : [];
  const facilities = data ? [...data.facilities].sort((a, b) => facilityShort(a).localeCompare(facilityShort(b))) : [];
  const weekEmpty = !!data && data.assignments.length === 0;

  return (
    <div className="schedule">
      <PageHeader
        title="Schedule"
        description="Where each provider is scheduled, by week."
        aside={
          <button type="button" className="button button-primary-sm" onClick={() => setEditing({ existing: null, prefill: { date: today >= weekStart && today <= addDays(weekStart, 6) ? today : weekStart } })} disabled={!data}>
            + Add entry
          </button>
        }
      />

      <div className="schedule-toolbar">
        <div className="week-nav" role="group" aria-label="Week">
          <button type="button" className="button" onClick={() => goTo(addDays(weekStart, -7))} aria-label="Previous week">
            ‹ Prev
          </button>
          <button type="button" className="button" onClick={() => goTo(thisWeek)} disabled={weekStart === thisWeek}>
            This week
          </button>
          <button type="button" className="button" onClick={() => goTo(addDays(weekStart, 7))} aria-label="Next week">
            Next ›
          </button>
          <span className="week-label" aria-live="polite">
            {weekLabel(weekStart)}
            {board.status === "ready" && board.loading && <span className="muted"> · loading…</span>}
          </span>
        </div>

        <div className="schedule-filters">
          <input
            type="search"
            className="search"
            placeholder={view === "providers" ? "Search providers" : "Search facilities"}
            aria-label="Search"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
          <select className="select" aria-label="Provider" value={filters.staffId ?? ""} onChange={(e) => setFilters((f) => ({ ...f, staffId: e.target.value || null }))}>
            <option value="">All providers</option>
            {providers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
          <select className="select" aria-label="Facility" value={filters.facilityId ?? ""} onChange={(e) => setFilters((f) => ({ ...f, facilityId: e.target.value || null }))}>
            <option value="">All facilities</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.abbreviation ? `${f.abbreviation} — ${f.name}` : f.name}
              </option>
            ))}
          </select>
          <label className="check">
            <input type="checkbox" checked={filters.showAll} onChange={(e) => setFilters((f) => ({ ...f, showAll: e.target.checked }))} />
            Show all
          </label>
          <div className="segmented" role="group" aria-label="View">
            <button type="button" className="segment" aria-pressed={view === "providers"} onClick={() => {
                setView("providers");
                setQuick(null);
              }}>
              Providers
            </button>
            <button type="button" className="segment" aria-pressed={view === "facilities"} onClick={() => {
                setView("facilities");
                setQuick(null);
              }}>
              Facilities
            </button>
          </div>
        </div>
      </div>

      {dropIssue && (
        <div className="notice" role="alert">
          <div>
            <p className="feedback-title">
              {dropIssue.kind === "conflicts" ? `Not ${dropIssue.copy ? "copied" : "moved"} — this clashes:` : `Check before ${dropIssue.copy ? "copying" : "moving"}:`}
            </p>
            <ul className="notice-list">
              {dropIssue.issues.map((i, n) => (
                <li key={n}>{i.message}</li>
              ))}
            </ul>
            {dropIssue.kind === "warnings" && (
              <div className="quick-confirm">
                <button type="button" className="button button-primary-sm" onClick={() => dropped(dropIssue.entry, { date: dropIssue.input.date }, dropIssue.copy, true, dropIssue.input)}>
                  {dropIssue.copy ? "Copy anyway" : "Move anyway"}
                </button>
                <button type="button" className="button" onClick={() => setDropIssue(null)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
          <button type="button" className="notice-dismiss" onClick={() => setDropIssue(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button type="button" className="notice-dismiss" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {board.status === "loading" && <LoadingState />}
      {board.status === "error" && <ErrorState error={board.error} />}
      {data && (
        <>
          <ScheduleBoard
            data={data}
            weekStart={board.status === "ready" ? board.weekStart : weekStart}
            today={today}
            view={view}
            filters={filters}
            onEdit={(existing) => {
              closeQuick(false);
              setEditing({ existing, prefill: null });
            }}
            onQuickAdd={(prefill, anchor) => {
              setDropIssue(null);
              setQuick({ prefill, anchor });
            }}
            onDrop={(entry, target, copy) => {
              closeQuick(false);
              void dropped(entry, target, copy);
            }}
          />
          <div className="schedule-foot">
            <span className="section-note">
              {data.assignments.length} {data.assignments.length === 1 ? "entry" : "entries"} this week. Names and facilities come from the organization records.
            </span>
            <button type="button" className="button" onClick={copyPreviousWeek} disabled={copying}>
              {copying ? "Copying…" : weekEmpty ? "Copy previous week" : "Copy previous week into empty days"}
            </button>
          </div>
        </>
      )}

      {quick && data && (
        <QuickAdd
          key={`${quick.prefill.date}:${quick.prefill.staffId ?? quick.prefill.facilityId}`}
          data={data}
          context={quick.prefill}
          anchor={quick.anchor}
          onClose={() => closeQuick()}
          onCreated={quickAdded}
          onOpenFullForm={(prefill) => {
            closeQuick(false);
            setEditing({ existing: null, prefill });
          }}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button type="button" className="toast-undo" onClick={undo}>
              Undo
            </button>
          )}
          <button type="button" className="notice-dismiss" onClick={() => setToast(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {editing && data && (
        <AssignmentEditor
          data={data}
          existing={editing.existing}
          prefill={editing.prefill}
          onClose={() => setEditing(null)}
          onSaved={saved}
          onDeleted={() => {
            setEditing(null);
            setNotice("Entry deleted.");
            board.reload();
          }}
        />
      )}
    </div>
  );
}
