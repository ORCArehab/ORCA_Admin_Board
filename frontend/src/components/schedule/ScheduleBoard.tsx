"use client";

import { useState } from "react";
import { facilityRows, NO_FACILITY_KEY, providerRows, type BoardFilters, type BoardRow } from "@/lib/schedule/board";
import { planDrop, type DropTarget } from "@/lib/schedule/dragDrop";
import { entryLabel, facilityShort, timeText, TYPE_LABELS } from "@/lib/schedule/format";
import type { Assignment, AssignmentType, FacilityRecord, ScheduleBoardData, StaffRecord, TimeBlock } from "@/lib/schedule/types";
import { dayHeading, weekDays } from "@/lib/schedule/week";

export type BoardView = "providers" | "facilities";

/** What a click on an empty cell starts: a new entry with the row and date filled in. */
export interface NewEntryPrefill {
  date: string;
  staffId?: string;
  facilityId?: string;
  /** Carried over from quick add's "Open full form". */
  type?: AssignmentType;
  timeBlock?: TimeBlock;
  startTime?: string;
  endTime?: string;
  coveringStaffId?: string;
  notes?: string;
}

const ABSENT = new Set(["pto", "off"]);

const DRAG_TYPE = "application/x-orca-assignment";

/**
 * The weekly board. Rows are providers or facilities; both views draw the same entries.
 *   click an empty cell → quick add (the row and day are already known)
 *   click an entry → its full editor
 *   drag an entry to another cell → move it there; hold Alt/Option while dropping → copy it
 */
export function ScheduleBoard({
  data,
  weekStart,
  today,
  view,
  filters,
  onEdit,
  onQuickAdd,
  onDrop,
}: {
  data: ScheduleBoardData;
  weekStart: string;
  today: string;
  view: BoardView;
  filters: BoardFilters;
  onEdit: (assignment: Assignment) => void;
  onQuickAdd: (prefill: NewEntryPrefill, anchor: HTMLElement) => void;
  onDrop: (assignment: Assignment, target: DropTarget, copy: boolean) => void;
}) {
  const [dragging, setDragging] = useState<Assignment | null>(null);
  const [over, setOver] = useState<{ key: string; copy: boolean } | null>(null);
  const days = weekDays(weekStart);
  const staffById = new Map(data.staff.map((s) => [s.id, s]));
  const facilityById = new Map(data.facilities.map((f) => [f.id, f]));

  const providerView = view === "providers";
  const pRows = providerView ? providerRows(data, weekStart, filters) : [];
  const fResult = providerView ? null : facilityRows(data, weekStart, filters);
  const rowCount = providerView ? pRows.length : fResult!.rows.length + (fResult!.elsewhere ? 1 : 0);

  function chip(a: Assignment) {
    const facility = a.facilityId ? facilityById.get(a.facilityId) : undefined;
    const person = staffById.get(a.staffId);
    const main = providerView ? entryLabel(a, facility) : (person?.displayName ?? "Unknown provider");
    const sub = providerView ? timeText(a) : [a.type === "facility" ? "" : a.type === "coverage" ? "Cov" : TYPE_LABELS[a.type], timeText(a)].filter(Boolean).join(" · ");
    const covering = a.coveringStaffId ? staffById.get(a.coveringStaffId)?.displayName : null;
    const title = [
      person?.displayName,
      facility ? facility.name : TYPE_LABELS[a.type],
      a.type === "coverage" && covering ? `covering for ${covering}` : null,
      timeText(a) || "All day",
      a.notes,
    ]
      .filter(Boolean)
      .join(" — ");
    return (
      <li key={a.id}>
        <button
          type="button"
          className={`chip chip-${a.type}${dragging?.id === a.id ? " is-dragging" : ""}`}
          onClick={() => onEdit(a)}
          title={`${title}\nDrag to move · Alt/Option-drag to copy`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, a.id);
            e.dataTransfer.effectAllowed = "copyMove";
            setDragging(a);
          }}
          onDragEnd={() => {
            setDragging(null);
            setOver(null);
          }}
        >
          <span className="chip-main">{main}</span>
          {sub && <span className="chip-sub">{sub}</span>}
          {a.notes && <span className="chip-note" aria-label="Has notes" />}
        </button>
      </li>
    );
  }

  function cell(entries: Assignment[], date: string, prefill: NewEntryPrefill | null, label: string, target: DropTarget) {
    const key = `${target.staffId ?? target.facilityId ?? NO_FACILITY_KEY}:${date}`;
    const plan = dragging ? planDrop(dragging, target) : null;
    const isOver = over?.key === key;
    const dropState = isOver && plan ? (plan.kind === "invalid" ? " is-drop-invalid" : plan.kind === "change" ? (over.copy ? " is-drop-copy" : " is-drop") : "") : "";
    return (
      <td
        key={date}
        className={`board-cell${date === today ? " is-today" : ""}${entries.some((a) => ABSENT.has(a.type)) ? " is-away" : ""}${dropState}`}
        onDragOver={(e) => {
          if (!dragging || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          // An invalid target still accepts the drop (outlined as a caution), so the reason can be shown.
          e.dataTransfer.dropEffect = e.altKey ? "copy" : "move";
          if (over?.key !== key || over.copy !== e.altKey) setOver({ key, copy: e.altKey });
        }}
        onDragLeave={(e) => {
          if (isOver && !e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
        }}
        onDrop={(e) => {
          if (!dragging) return;
          e.preventDefault();
          const entry = dragging;
          setDragging(null);
          setOver(null);
          onDrop(entry, target, e.altKey);
        }}
      >
        {entries.length > 0 && <ul className="chip-list">{entries.map(chip)}</ul>}
        {prefill && (
          <button
            type="button"
            className="cell-add"
            onClick={(e) => onQuickAdd(prefill, e.currentTarget)}
            aria-label={`Add entry: ${label}, ${dayHeading(date).weekday} ${dayHeading(date).day}`}
            aria-haspopup="dialog"
          >
            <span aria-hidden="true">+</span>
          </button>
        )}
      </td>
    );
  }

  const providerRow = (row: BoardRow<StaffRecord>) => (
    <tr key={row.key}>
      <th scope="row" className="board-rowhead">
        <span className="rowhead-name">{row.record.displayName}</span>
        {row.record.credentials && <span className="rowhead-sub">{row.record.credentials}</span>}
      </th>
      {days.map((d) => cell(row.cells[d] ?? [], d, { date: d, staffId: row.key }, row.record.displayName, { date: d, staffId: row.key }))}
    </tr>
  );

  const facilityRow = (row: BoardRow<FacilityRecord>) => (
    <tr key={row.key}>
      <th scope="row" className="board-rowhead" title={row.record.name}>
        <span className="rowhead-name">{facilityShort(row.record)}</span>
        {row.record.abbreviation && <span className="rowhead-sub">{row.record.name}</span>}
        {row.record.operationalStatus === "inactive" && <span className="rowhead-sub caution-text">Inactive</span>}
      </th>
      {days.map((d) => cell(row.cells[d] ?? [], d, { date: d, facilityId: row.key }, facilityShort(row.record), { date: d, facilityId: row.key }))}
    </tr>
  );

  return (
    <div className="table-wrap board-wrap">
      <table className="board">
        <caption className="sr-only">{providerView ? "Schedule by provider" : "Schedule by facility"}</caption>
        <thead>
          <tr>
            <th scope="col" className="board-corner">
              {providerView ? "Provider" : "Facility"}
            </th>
            {days.map((d) => {
              const h = dayHeading(d);
              return (
                <th scope="col" key={d} className={d === today ? "is-today" : undefined} aria-current={d === today ? "date" : undefined}>
                  <span className="day-weekday">{h.weekday}</span> <span className="day-date">{h.day}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rowCount === 0 ? (
            <tr>
              <td className="table-empty" colSpan={8}>
                {filters.search || filters.staffId || filters.facilityId
                  ? "Nothing matches these filters this week."
                  : filters.showAll
                    ? `No ${providerView ? "providers" : "facilities"} to show.`
                    : "Nothing is scheduled this week yet. Use Add entry, or Show all to schedule from an empty board."}
              </td>
            </tr>
          ) : providerView ? (
            pRows.map(providerRow)
          ) : (
            <>
              {fResult!.rows.map(facilityRow)}
              {fResult!.elsewhere && (
                <tr className="board-elsewhere">
                  <th scope="row" className="board-rowhead">
                    <span className="rowhead-name">Not at a facility</span>
                    <span className="rowhead-sub">Admin, clinic, PTO, off</span>
                  </th>
                  {days.map((d) => cell(fResult!.elsewhere!.cells[d] ?? [], d, null, "", { date: d, facilityId: null }))}
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
