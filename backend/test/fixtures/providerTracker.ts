import type { ProviderTrackerConfig } from "../../src/config/sources.js";
import { ProviderTrackerConfigSchema } from "../../src/config/sources.js";
import type { CellValue, SpreadsheetSnapshot, TabValues } from "../../src/integrations/google/sheets.js";

/** ISO date → Google Sheets serial number (as returned with SERIAL_NUMBER rendering). */
export function serial(iso: string): number {
  return (Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

export const TODAY = "2026-09-29";

const HEADER = ["VISIT DATE", "FACILITIES", "Billing sheet", "CONSULT NOTES", "PROGRESS NOTES", "TOTAL", "UPLOADED NOTES", "Face sheet", "REMARKS"];

/** Mapped to "Jane Doe" by config; title row above the header, many edge cases. */
const janeDoe: CellValue[][] = [
  ["JANE DOE NP — 2026"],
  HEADER,
  /* r3 */ [serial("2026-09-01"), "Facility A", true, 2, 3, 5, true, true, "REMARK-SENTINEL"],
  /* r4 */ [serial("2026-09-10"), "Facility B", false, 1, 4, 5, false, false, ""],
  /* r5 */ [serial("2026-09-15"), "Facility A / Facility C", false, 0, 6, 6, false, null, ""],
  /* r6 */ [null, null, false, null, null, null, false, false], // template row
  /* r7 */ ["SEPTEMBER"], // section label
  /* r8 */ ["9/20/2026", "Facility B", true, 1, 1, 3, true, true, ""], // TOTAL mismatch
  /* r9 */ ["9/3-9/5", "Facility D", false, 2, 0, 2, false, false, ""], // unreadable date
  /* r10 */ [serial("2026-09-21"), "Facility A", false, 1, null, null, false, false, ""], // missing TOTAL
  /* r11 */ [serial("2026-09-22"), "Facility A", true, 1, 0, 1, "Pending", true, ""], // unexpected status
  HEADER, // repeated header block
];

/** Unmapped provider tab (named by title); no Face sheet / Billing sheet columns. */
const bobSmith: CellValue[][] = [
  ["VISIT DATE", "FACILITIES", "CONSULT NOTES", "PROGRESS NOTES", "TOTAL", "UPLOADED NOTES"],
  [serial("2026-09-05"), "Facility E", 0, 0, 0, false],
  [serial("2026-09-06"), "Facility E", 1, 1, 2, true],
];

/** Mapped to "Kim Lee" but has lost its UPLOADED NOTES column. */
const kimLee: CellValue[][] = [
  ["VISIT DATE", "FACILITIES", "CONSULT NOTES", "PROGRESS NOTES", "TOTAL"],
  [serial("2026-09-02"), "Facility F", 1, 1, 2],
];

/** Summary tab whose headers resemble provider tabs; excluded via config. */
const biller: CellValue[][] = [
  ["PROVIDER", "VISIT DATE", "TOTAL", "UPLOADED NOTES"],
  ["Jane Doe", serial("2026-09-01"), 999, true],
];

const dashboard: CellValue[][] = [["Summary"], ["Overall", 1234]];

const oldProvider: CellValue[][] = [HEADER, [serial("2026-01-05"), "Facility Z", false, 1, 0, 1, false, false]];

function tab(sheetId: number, title: string, values: CellValue[][], hidden = false, index = 0): TabValues {
  return { sheetId, title, hidden, index, values };
}

export function trackerSnapshot(): SpreadsheetSnapshot {
  return {
    spreadsheetId: "test-sheet",
    title: "ORCA-NP/Scribe Tracker 2026 (fixture)",
    fetchedAt: "2026-09-29T15:00:00.000Z",
    tabs: [
      tab(100, "Dashboard", dashboard, false, 0),
      tab(200, "BILLER", biller, false, 1),
      tab(300, "JD", janeDoe, false, 2),
      tab(400, "Bob Smith", bobSmith, false, 3),
      tab(500, "KL", kimLee, false, 4),
      tab(600, "Old NP", oldProvider, true, 5),
    ],
  };
}

export function trackerConfig(overrides: Partial<ProviderTrackerConfig> = {}): ProviderTrackerConfig {
  return ProviderTrackerConfigSchema.parse({
    providers: { "gid:300": "Jane Doe", KL: "Kim Lee", "gid:999": "Removed Provider" },
    excludeTabs: ["BILLER"],
    ...overrides,
  });
}
