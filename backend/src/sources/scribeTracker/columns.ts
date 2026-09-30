import type { CellValue } from "../../integrations/google/sheets.js";
import { normalizeHeader } from "../../lib/sheetHeaders.js";
import type { ScribeField } from "./types.js";

const ALIASES: Record<ScribeField, string[]> = {
  workDate: ["DATE", "WORK DATE"],
  scribe: ["SCRIBE"],
  clockIn: ["CLOCK IN"],
  startBreak: ["START BREAK"],
  endBreak: ["END BREAK"],
  clockOut: ["CLOCK OUT"],
  totalHours: ["TOTAL HOURS"],
  facilities: ["FACILITIES", "FACILITY"],
  serviceDate: ["DOS", "DOS DATE", "SERVICE DATE", "DATE OF SERVICE"],
  consultNotes: ["CONSULT NOTES"],
  progressNotes: ["PROGRESS NOTES", "FOLLOW UP NOTES"],
  total: ["TOTAL", "TOTAL NOTES"],
  uploadedNotes: ["UPLOADED NOTES"],
  extraNotes: ["EXTRA NOTES"],
};

const LOOKUP = new Map<string, ScribeField>();
for (const [field, aliases] of Object.entries(ALIASES) as [ScribeField, string[]][]) for (const a of aliases) LOOKUP.set(normalizeHeader(a), field);

export interface ScribeHeader {
  rowIndex: number;
  columns: Partial<Record<ScribeField, number>>;
}

/**
 * Map a header row to fields. Daily Production has two "DATE" columns: the first is the
 * work date; a later "DATE" (after FACILITIES) is the date of service.
 */
export function matchScribeHeader(row: CellValue[], rowIndex: number): ScribeHeader {
  const columns: Partial<Record<ScribeField, number>> = {};
  row.forEach((cell, col) => {
    let field = LOOKUP.get(normalizeHeader(cell));
    if (field === "workDate" && columns.workDate !== undefined) field = "serviceDate";
    if (field && columns[field] === undefined) columns[field] = col;
  });
  return { rowIndex, columns };
}

export function findScribeHeader(values: CellValue[][], scanRows: number): ScribeHeader | null {
  let best: ScribeHeader | null = null;
  for (let i = 0; i < Math.min(values.length, scanRows); i++) {
    const m = matchScribeHeader(values[i] ?? [], i);
    const count = Object.keys(m.columns).length;
    if (count >= 3 && (!best || count > Object.keys(best.columns).length)) best = m;
  }
  return best;
}
