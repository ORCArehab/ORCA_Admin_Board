import type { IsoDate } from "../../lib/dates.js";

/** Columns read from the Daily Production tab. AVERAGE is ignored (we compute rates ourselves). */
export type ScribeField =
  | "workDate"
  | "scribe"
  | "clockIn"
  | "startBreak"
  | "endBreak"
  | "clockOut"
  | "totalHours"
  | "facilities"
  | "serviceDate"
  | "consultNotes"
  | "progressNotes"
  | "total"
  | "uploadedNotes"
  | "extraNotes";

/** A tab must have these to be the production tab (per-scribe tabs have no SCRIBE column). */
export const REQUIRED_SCRIBE_FIELDS: readonly ScribeField[] = ["workDate", "scribe", "totalHours", "total", "uploadedNotes"];

/** One typed row (a work session, or a continuation line of one) from Daily Production. */
export interface ScribeRow {
  scribe: string;
  tab: string;
  sheetId: number;
  /** 1-based sheet row. */
  row: number;
  /** The scribe's work date (production is attributed to this date, not the date of service). */
  workDate: IsoDate;
  /**
   * DATE and SCRIBE were blank and filled down from the preceding row, because the row matches
   * the sheet's continuation structure (facility + date of service, no clock times).
   */
  inheritedAttribution: boolean;
  /** Authoritative hours: stored TOTAL HOURS. */
  storedHours: number | null;
  /** Validation only: (clock out − clock in) − break, handling midnight crossings. */
  clockHours: number | null;
  crossesMidnight: boolean;
  /** Row describes a work session (has clock times or stored hours), not only a continuation line. */
  isSession: boolean;
  /** Internal only; never returned by the API (facility names are reported as counts in V1). */
  facilities: string | null;
  /** Several facilities under one entry; production stays unallocated, never divided. */
  multiFacility: boolean;
  consultNotes: number | null;
  progressNotes: number | null;
  total: number | null;
  uploadedNotes: number | null;
  /** Privacy-safe normalized pattern of EXTRA NOTES (data-quality analysis only; never counted). */
  extraNotesPattern?: string;
}
