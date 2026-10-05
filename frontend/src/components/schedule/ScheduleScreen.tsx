"use client";

import { useEffect, useState } from "react";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { copyWeek, type SaveResult } from "@/lib/schedule/api";
import { isProvider, type BoardFilters } from "@/lib/schedule/board";
import { facilityShort } from "@/lib/schedule/format";
import type { Assignment } from "@/lib/schedule/types";
import { useScheduleBoard } from "@/lib/schedule/useScheduleBoard";
import { addDays, weekLabel, weekStart as weekStartOf } from "@/lib/schedule/week";
import { AssignmentEditor } from "./AssignmentEditor";
import { ScheduleBoard, type BoardView, type NewEntryPrefill } from "./ScheduleBoard";

type Editing = { existing: Assignment; prefill: null } | { existing: null; prefill: NewEntryPrefill } | null;

/** Operations scheduling: the weekly board, its filters, and the entry editor. */
export function ScheduleScreen({ today, initialWeekStart, initialView }: { today: string; initialWeekStart: string; initialView: BoardView }) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [view, setView] = useState<BoardView>(initialView);
  const [filters, setFilters] = useState<BoardFilters>({ search: "", staffId: null, facilityId: null, showAll: false });
  const [editing, setEditing] = useState<Editing>(null);
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
  };

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
            <button type="button" className="segment" aria-pressed={view === "providers"} onClick={() => setView("providers")}>
              Providers
            </button>
            <button type="button" className="segment" aria-pressed={view === "facilities"} onClick={() => setView("facilities")}>
              Facilities
            </button>
          </div>
        </div>
      </div>

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
            onEdit={(existing) => setEditing({ existing, prefill: null })}
            onCreate={(prefill) => setEditing({ existing: null, prefill })}
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
