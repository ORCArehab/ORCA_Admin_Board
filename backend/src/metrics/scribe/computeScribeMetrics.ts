import type { IsoDate } from "../../lib/dates.js";
import type { ScribeRow } from "../../sources/scribeTracker/index.js";

/**
 * Descriptive scribe production metrics. Pure.
 *
 * Production (notes produced) and upload activity (notes uploaded) are separate: uploads can
 * be for work produced on earlier dates, so they are never divided by production. There is no
 * completion %, outstanding count, ranking or score. Everything is attributed to the work date.
 */
export interface ProductionTotals {
  /** SUM(TOTAL) */
  notesProduced: number;
  /** SUM(CONSULT NOTES) */
  consults: number;
  /** SUM(PROGRESS NOTES) */
  followUps: number;
  /** SUM(stored TOTAL HOURS), all sessions including upload-only ones. Two decimals. */
  hoursWorked: number;
  /** notesProduced / hoursWorked (aggregate ratio, one decimal); null when no hours. */
  notesPerHour: number | null;
  /** SUM(UPLOADED NOTES): upload activity, reported separately from production. */
  notesUploaded: number;
}

export interface ScribeMetrics extends ProductionTotals {
  name: string;
  /** Rows describing a work session (clock times or stored hours). */
  sessions: number;
  /** Distinct work dates with at least one row. */
  workDays: number;
  /** Distinct facilities from single-facility entries (names compared case-insensitively). */
  facilitiesWorked: number;
  /** Entries naming several facilities; their production is not attributed to any facility. */
  multiFacilityEntries: number;
  /** Notes on multi-facility entries (unallocated to a facility, still counted in notesProduced). */
  unallocatedFacilityNotes: number;
  firstWorkDate: IsoDate | null;
  lastWorkDate: IsoDate | null;
}

export interface PeriodProduction extends ProductionTotals {
  /** Day: YYYY-MM-DD. Week: Monday's date (ISO week). Month: YYYY-MM. */
  period: string;
}

export interface ProductionSeries {
  daily: PeriodProduction[];
  weekly: PeriodProduction[];
  monthly: PeriodProduction[];
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

export function totalsFor(rows: ScribeRow[]): ProductionTotals {
  let notes = 0, consults = 0, followUps = 0, hours = 0, uploaded = 0;
  for (const r of rows) {
    notes += r.total ?? 0;
    consults += r.consultNotes ?? 0;
    followUps += r.progressNotes ?? 0;
    hours += r.storedHours ?? 0;
    uploaded += r.uploadedNotes ?? 0;
  }
  return {
    notesProduced: notes,
    consults,
    followUps,
    hoursWorked: round(hours, 2),
    notesPerHour: hours > 0 ? round(notes / hours, 1) : null,
    notesUploaded: uploaded,
  };
}

export function metricsFor(name: string, rows: ScribeRow[]): ScribeMetrics {
  const facilities = new Set<string>();
  let multi = 0, unallocated = 0;
  for (const r of rows) {
    if (r.multiFacility) {
      multi++;
      unallocated += r.total ?? 0;
    } else if (r.facilities) facilities.add(r.facilities.toLowerCase().replace(/\s+/g, " "));
  }
  const dates = [...new Set(rows.map((r) => r.workDate))].sort();
  return {
    name,
    ...totalsFor(rows),
    sessions: rows.filter((r) => r.isSession).length,
    workDays: dates.length,
    facilitiesWorked: facilities.size,
    multiFacilityEntries: multi,
    unallocatedFacilityNotes: unallocated,
    firstWorkDate: dates[0] ?? null,
    lastWorkDate: dates.at(-1) ?? null,
  };
}

/** Monday of the ISO week containing the date. */
export function weekStart(date: IsoDate): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

function seriesBy(rows: ScribeRow[], key: (d: IsoDate) => string): PeriodProduction[] {
  const groups = new Map<string, ScribeRow[]>();
  for (const r of rows) {
    const k = key(r.workDate);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, rs]) => ({ period, ...totalsFor(rs) }));
}

export function productionSeries(rows: ScribeRow[]): ProductionSeries {
  return {
    daily: seriesBy(rows, (d) => d),
    weekly: seriesBy(rows, weekStart),
    monthly: seriesBy(rows, (d) => d.slice(0, 7)),
  };
}

/** Per-scribe metrics, alphabetical (descriptive, not a ranking). */
export function computeScribeMetrics(rows: ScribeRow[]): ScribeMetrics[] {
  const byScribe = new Map<string, ScribeRow[]>();
  for (const r of rows) byScribe.set(r.scribe, [...(byScribe.get(r.scribe) ?? []), r]);
  return [...byScribe.entries()].map(([name, rs]) => metricsFor(name, rs)).sort((a, b) => a.name.localeCompare(b.name));
}
