"use client";

import { facilityRows, providerRows, type BoardFilters, type BoardRow } from "@/lib/schedule/board";
import { entryLabel, facilityShort, timeText, TYPE_LABELS } from "@/lib/schedule/format";
import type { Assignment, FacilityRecord, ScheduleBoardData, StaffRecord } from "@/lib/schedule/types";
import { dayHeading, weekDays } from "@/lib/schedule/week";

export type BoardView = "providers" | "facilities";

/** What a click on an empty cell starts: a new entry with the row and date filled in. */
export interface NewEntryPrefill {
  date: string;
  staffId?: string;
  facilityId?: string;
}

const ABSENT = new Set(["pto", "off"]);

/**
 * The weekly board. Rows are providers or facilities; both views draw the same entries.
 * Each chip opens its editor; empty space in a cell starts a new entry for that row and day.
 */
export function ScheduleBoard({
  data,
  weekStart,
  today,
  view,
  filters,
  onEdit,
  onCreate,
}: {
  data: ScheduleBoardData;
  weekStart: string;
  today: string;
  view: BoardView;
  filters: BoardFilters;
  onEdit: (assignment: Assignment) => void;
  onCreate: (prefill: NewEntryPrefill) => void;
}) {
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
        <button type="button" className={`chip chip-${a.type}`} onClick={() => onEdit(a)} title={title}>
          <span className="chip-main">{main}</span>
          {sub && <span className="chip-sub">{sub}</span>}
          {a.notes && <span className="chip-note" aria-label="Has notes" />}
        </button>
      </li>
    );
  }

  function cell(entries: Assignment[], date: string, prefill: NewEntryPrefill | null, label: string) {
    return (
      <td key={date} className={`board-cell${date === today ? " is-today" : ""}${entries.some((a) => ABSENT.has(a.type)) ? " is-away" : ""}`}>
        {entries.length > 0 && <ul className="chip-list">{entries.map(chip)}</ul>}
        {prefill && (
          <button type="button" className="cell-add" onClick={() => onCreate(prefill)} aria-label={`Add entry: ${label}, ${dayHeading(date).weekday} ${dayHeading(date).day}`}>
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
      {days.map((d) => cell(row.cells[d] ?? [], d, { date: d, staffId: row.key }, row.record.displayName))}
    </tr>
  );

  const facilityRow = (row: BoardRow<FacilityRecord>) => (
    <tr key={row.key}>
      <th scope="row" className="board-rowhead" title={row.record.name}>
        <span className="rowhead-name">{facilityShort(row.record)}</span>
        {row.record.abbreviation && <span className="rowhead-sub">{row.record.name}</span>}
        {row.record.operationalStatus === "inactive" && <span className="rowhead-sub caution-text">Inactive</span>}
      </th>
      {days.map((d) => cell(row.cells[d] ?? [], d, { date: d, facilityId: row.key }, facilityShort(row.record)))}
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
                    ? `No ${providerView ? "providers" : "active facilities"} to show.`
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
                  {days.map((d) => cell(fResult!.elsewhere!.cells[d] ?? [], d, null, ""))}
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
