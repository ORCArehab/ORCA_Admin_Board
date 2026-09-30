import { ScribeTrackerConfigSchema, type ScribeTrackerConfig } from "../../src/config/sources.js";
import type { CellValue, SpreadsheetSnapshot } from "../../src/integrations/google/sheets.js";
import { serial } from "./providerTracker.js";

export const SCRIBE_TODAY = "2026-09-29";

/** Time of day / duration as a fraction of a day (how Sheets returns times with UNFORMATTED_VALUE). */
export const t = (h: number, m = 0) => (h * 60 + m) / 1440;

export const DAILY_HEADER = [
  "DATE", "SCRIBE", "CLOCK IN", "START BREAK", "END BREAK", "CLOCK OUT", "TOTAL HOURS", "FACILITIES",
  "DATE", "CONSULT NOTES", "PROGRESS NOTES", "TOTAL", "AVERAGE", "UPLOADED NOTES", "EXTRA NOTES",
];

/**
 * Mirrors the real "Daily Production" structure (fictional names/facilities).
 * Columns: date, scribe, in, breakStart, breakEnd, out, hours, facilities, dos, consult, progress, total, avg, uploaded, extra
 */
export const dailyRows: CellValue[][] = [
  DAILY_HEADER,
  /* r2  */ [serial("2026-09-01"), "Ann", t(8), t(12), t(12, 30), t(16, 30), t(8), "Facility A", serial("2026-08-28"), 2, 10, 12, 1.5, null, null],
  /* r3  */ [null, null, null, null, null, null, "", "Facility B", serial("2026-08-29"), 0, 5, 5, "", null, null], // continuation (notes)
  /* r4  */ [null, null, null, null, null, null, "", "Facility A", "8/27 8/28", null, null, 0, "", 20, null], // continuation (uploads)
  /* r5  */ [null, null, null, null, null, null, "", null, null, null, null, 0, "", null, null], // blank: ends context
  /* r6  */ [null, null, null, null, null, null, "", "Facility D", serial("2026-08-30"), 0, 7, 7, "", null, null], // no context → unattributed
  /* r7  */ [serial("2026-09-01"), "Ann", t(20), null, null, t(1), t(5), "Facility A / Facility C", serial("2026-08-29"), 1, 5, 6, 1.2, null, null], // overnight
  /* r8  */ [serial("2026-09-02"), "Bea", t(9), null, null, t(17), t(3), "Facility A", serial("2026-08-28"), 0, 10, 10, 3.3, 4, "JQ 9/1 5 notes uploaded"], // typed hours disagree
  /* r9  */ [serial("2026-09-03"), "Bea", t(10), null, null, t(10, 5), t(0, 5), null, null, null, null, 0, "", 12, null], // short, upload-only
  /* r10 */ [serial("2026-07-15"), "Bea", t(9), null, null, t(10), t(1), "Facility A", null, 0, 3, 3, 3, null, null], // before history start
  /* r11 */ ["not a date", "Bea", t(9), null, null, t(10), t(1), "Facility A", null, 0, 1, 1, 1, null, null],
  /* r12 */ [serial("2026-09-04"), "Zed #4417!", t(9), null, null, t(10), t(1), "Facility A", null, 0, 1, 1, 1, null, null],
  /* r13 */ [serial("2026-09-04"), null, null, null, null, null, "", "Facility A", serial("2026-09-01"), 0, 2, 2, "", null, null],
  /* r14 */ [serial("2026-09-08"), "Ann", t(8), t(12), null, t(12), t(4), null, null, 1, 2, "abc", "", null, null], // incomplete break, bad TOTAL
  /* r15 */ [null, null, null, null, null, null, "", null, null, null, null, 0, "", null, null], // formula-zero template row
];

export function scribeSnapshot(daily: CellValue[][] = dailyRows): SpreadsheetSnapshot {
  return {
    spreadsheetId: "scribe-test",
    title: "Scribe Tracker (fixture)",
    fetchedAt: "2026-09-29T15:00:00.000Z",
    tabs: [
      // Summary tab: derived, must never be used.
      { sheetId: 1, title: "PAY PERIOD", hidden: false, index: 0, values: [["SCRIBE", "TOTAL HOURS", "TOTAL NOTES", "AVERAGE", "TOTAL UPLOADS"], ["Ann", 99, 999, 9, 999]] },
      { sheetId: 2, title: "Daily Production", hidden: false, index: 1, values: daily },
      // Per-scribe history tab: no SCRIBE column, ignored in V1.
      {
        sheetId: 3,
        title: "ANN",
        hidden: false,
        index: 2,
        values: [
          ["DATE", "CLOCK IN", "START BREAK", "END BREAK", "CLOCK OUT", "TOTAL HOURS", "CONSULT NOTES", "PROGRESS NOTES", "TOTAL", "AVERAGE", "UPLOADED NOTES", "EXTRA NOTES"],
          [serial("2026-09-01"), t(8), null, null, t(16), t(8), 5, 500, 505, 63, 0, "history"],
        ],
      },
    ],
  };
}

export function scribeConfig(overrides: Partial<ScribeTrackerConfig> = {}): ScribeTrackerConfig {
  return ScribeTrackerConfigSchema.parse({ historyStartsOn: "2026-08-01", ...overrides });
}
