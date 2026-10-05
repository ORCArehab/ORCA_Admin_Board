import { facilityShort } from "./format";
import type { Assignment, FacilityRecord, ScheduleBoardData, StaffRecord } from "./types";
import { weekDays } from "./week";

/**
 * The two board views are projections of the same entries: by provider (rows = staff) and by
 * facility (rows = facilities). Nothing here is stored separately.
 */

export interface BoardFilters {
  search: string;
  staffId: string | null;
  facilityId: string | null;
  /** Show every provider / schedulable facility, not just those with entries this week. */
  showAll: boolean;
}

export interface BoardRow<T> {
  key: string;
  record: T;
  /** Entries per date, in the board's day order. */
  cells: Record<string, Assignment[]>;
}

export const PROVIDER_CATEGORIES = ["physician", "np_pa"];
export const isProvider = (s: StaffRecord) => PROVIDER_CATEGORIES.includes(s.category);

const matches = (text: string, search: string) => text.toLowerCase().includes(search.trim().toLowerCase());

function filterEntries(data: ScheduleBoardData, filters: BoardFilters) {
  return data.assignments.filter(
    (a) => (!filters.staffId || a.staffId === filters.staffId) && (!filters.facilityId || a.facilityId === filters.facilityId),
  );
}

function emptyCells(days: string[]) {
  return Object.fromEntries(days.map((d) => [d, [] as Assignment[]]));
}

const byName = (a: { displayName?: string; name?: string }, b: { displayName?: string; name?: string }) =>
  (a.displayName ?? a.name ?? "").localeCompare(b.displayName ?? b.name ?? "");

/** Rows by provider: providers with entries this week (or every provider with "show all"). */
export function providerRows(data: ScheduleBoardData, weekStartIso: string, filters: BoardFilters): BoardRow<StaffRecord>[] {
  const days = weekDays(weekStartIso);
  const entries = filterEntries(data, filters);
  const staffById = new Map(data.staff.map((s) => [s.id, s]));
  const narrowed = !!filters.staffId || !!filters.facilityId;

  const ids = new Set(entries.map((a) => a.staffId));
  if (!narrowed && filters.showAll) for (const s of data.staff) if (isProvider(s) && s.employmentStatus !== "separated") ids.add(s.id);
  if (filters.staffId) ids.add(filters.staffId);

  const rows = [...ids]
    .map((id) => staffById.get(id))
    .filter((s): s is StaffRecord => !!s && (!filters.search || matches(s.displayName, filters.search)))
    .sort(byName)
    .map((record) => ({ key: record.id, record, cells: emptyCells(days) }));
  const rowById = new Map(rows.map((r) => [r.key, r]));
  for (const a of entries) rowById.get(a.staffId)?.cells[a.date]?.push(a);
  return rows;
}

/**
 * Facilities "Show all" lists: active ones, and those whose status no source has set yet
 * ("unknown", which is most of them until HIM records operational status). Inactive and
 * prospective facilities stay out of the default board but remain selectable in the editor.
 */
export const isSchedulableFacility = (f: FacilityRecord) => f.operationalStatus === "active" || f.operationalStatus === "unknown";

/** The pseudo-row in the facility view for admin, clinic, PTO and off entries with no facility. */
export const NO_FACILITY_KEY = "no-facility";

/** Rows by facility: facilities with entries this week (or every schedulable facility with "show all"). */
export function facilityRows(
  data: ScheduleBoardData,
  weekStartIso: string,
  filters: BoardFilters,
): { rows: BoardRow<FacilityRecord>[]; elsewhere: BoardRow<null> | null } {
  const days = weekDays(weekStartIso);
  const entries = filterEntries(data, filters);
  const facilityById = new Map(data.facilities.map((f) => [f.id, f]));
  const narrowed = !!filters.staffId || !!filters.facilityId;

  const ids = new Set(entries.flatMap((a) => (a.facilityId ? [a.facilityId] : [])));
  if (!narrowed && filters.showAll) for (const f of data.facilities) if (isSchedulableFacility(f)) ids.add(f.id);
  if (filters.facilityId) ids.add(filters.facilityId);

  const rows = [...ids]
    .map((id) => facilityById.get(id))
    .filter((f): f is FacilityRecord => !!f && (!filters.search || matches(`${f.name} ${f.abbreviation ?? ""}`, filters.search)))
    .sort((a, b) => facilityShort(a).localeCompare(facilityShort(b)))
    .map((record) => ({ key: record.id, record, cells: emptyCells(days) }));
  const rowById = new Map(rows.map((r) => [r.key, r]));

  const away = entries.filter((a) => !a.facilityId);
  const elsewhere = away.length > 0 && !filters.facilityId && !filters.search ? { key: NO_FACILITY_KEY, record: null, cells: emptyCells(days) } : null;
  for (const a of entries) {
    if (a.facilityId) rowById.get(a.facilityId)?.cells[a.date]?.push(a);
    else elsewhere?.cells[a.date]?.push(a);
  }
  return { rows, elsewhere };
}
