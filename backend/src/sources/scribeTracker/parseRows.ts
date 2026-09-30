import type { ScribeTrackerConfig } from "../../config/sources.js";
import type { CellValue } from "../../integrations/google/sheets.js";
import type { DataQualityIssue } from "../../lib/dataQuality.js";
import { fromSheetsSerial, parseDateString, type IsoDate } from "../../lib/dates.js";
import { normalizeFreeText, safeCellValue } from "../../lib/privacy.js";
import { isBlank } from "../../lib/sheetHeaders.js";
import { matchScribeHeader, type ScribeHeader } from "./columns.js";
import type { ScribeField, ScribeRow } from "./types.js";

export interface ParseScribeTabInput {
  tab: string;
  sheetId: number;
  values: CellValue[][];
  header: ScribeHeader;
  config: ScribeTrackerConfig;
  today: IsoDate;
}

export interface ParseScribeTabResult {
  rows: ScribeRow[];
  issues: DataQualityIssue[];
  skippedRows: number;
}

/** Scribe names are staff names; anything that doesn't look like one is rejected (never echoed). */
const NAME_PATTERN = /^\p{L}[\p{L} .'\-()]{0,39}$/u;
const TIME_FIELDS: ScribeField[] = ["clockIn", "startBreak", "endBreak", "clockOut", "totalHours"];

/** Strip floating-point noise from day-fraction × 24 (sub-second precision). */
const clean = (hours: number) => Math.round(hours * 1e6) / 1e6;

type Parsed<T> = { ok: true; value: T } | { ok: false };

function parseDate(v: CellValue | undefined): Parsed<IsoDate> {
  const iso = typeof v === "number" ? fromSheetsSerial(v) : typeof v === "string" ? parseDateString(v) : null;
  return iso ? { ok: true, value: iso } : { ok: false };
}

/** Time of day as a fraction of a day. Date-times (≥ 1) keep only the time part; "h:mm AM" text is accepted. */
function parseTime(v: CellValue | undefined): Parsed<number | null> {
  if (isBlank(v)) return { ok: true, value: null };
  if (typeof v === "number" && v >= 0) return { ok: true, value: v % 1 };
  if (typeof v === "string") {
    const m = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?\s*$/.exec(v);
    if (m) {
      let h = Number(m[1]);
      const min = Number(m[2]);
      const ampm = m[3]?.toUpperCase();
      if (ampm === "PM" && h < 12) h += 12;
      if (ampm === "AM" && h === 12) h = 0;
      if (h < 24 && min < 60) return { ok: true, value: (h * 60 + min) / 1440 };
    }
  }
  return { ok: false };
}

function parseCount(v: CellValue | undefined): Parsed<number | null> {
  if (isBlank(v)) return { ok: true, value: null };
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 ? { ok: true, value: n } : { ok: false };
}

/**
 * Parse Daily Production rows.
 *
 * Attribution: a row with DATE and SCRIBE sets the context. A following row with blank DATE and
 * SCRIBE inherits that context only if it matches the continuation structure found in the real
 * sheet (a facility and a date of service, and no clock times or hours). Blank rows end the
 * context. Anything else without attribution is flagged and excluded, never guessed.
 *
 * Hours: stored TOTAL HOURS is authoritative. Clock-derived hours are computed for validation
 * only (midnight crossings handled); disagreements are flagged, never overwritten.
 */
export function parseScribeTab(input: ParseScribeTabInput): ParseScribeTabResult {
  const { values, header, tab, sheetId, config } = input;
  const cols = header.columns;
  const rows: ScribeRow[] = [];
  const issues: DataQualityIssue[] = [];
  const canonical = new Map(Object.entries(config.scribes).map(([k, v]) => [k.trim().toLowerCase(), v]));
  let skippedRows = 0;
  let context: { workDate: IsoDate; scribe: string } | null = null;

  for (let i = header.rowIndex + 1; i < values.length; i++) {
    const cells = values[i] ?? [];
    const rowNumber = i + 1;
    const cell = (f: ScribeField): CellValue | undefined => (cols[f] === undefined ? undefined : cells[cols[f]!]);
    const has = (f: ScribeField) => !isBlank(cell(f));
    const flag = (code: string, severity: DataQualityIssue["severity"], column: ScribeField | undefined, message: string, value?: CellValue, scribe?: string) =>
      issues.push({ code, severity, scope: "row", tab, sheetId, row: rowNumber, column, message, ...(scribe ? { scribe } : {}), ...(value !== undefined ? { value: safeCellValue(value) } : {}) });

    // TOTAL is a SUM() formula that shows 0 on empty rows, so 0 alone is not content.
    const contentFields: ScribeField[] = ["workDate", "scribe", "clockIn", "clockOut", "totalHours", "facilities", "serviceDate", "consultNotes", "progressNotes", "uploadedNotes"];
    const hasContent = contentFields.some(has) || (has("total") && cell("total") !== 0);
    if (!hasContent) {
      context = null; // a blank row ends any continuation block
      skippedRows++;
      continue;
    }
    if (Object.keys(matchScribeHeader(cells, i).columns).length >= 3) {
      context = null;
      skippedRows++;
      continue;
    }

    // ── Attribution ──
    let workDate: IsoDate;
    let scribe: string;
    let inherited = false;
    if (has("workDate") && has("scribe")) {
      const date = parseDate(cell("workDate"));
      const rawName = String(cell("scribe")).trim();
      if (!date.ok) {
        flag("INVALID_DATE", "warning", "workDate", "Work DATE is not a readable date; row excluded.", cell("workDate"));
        context = null;
        continue;
      }
      if (!NAME_PATTERN.test(rawName)) {
        flag("INVALID_SCRIBE", "warning", "scribe", "SCRIBE is not a recognizable name; row excluded.", cell("scribe"));
        context = null;
        continue;
      }
      if (config.historyStartsOn && date.value < config.historyStartsOn) {
        flag("OUT_OF_RANGE_DATE", "warning", "workDate", `Work DATE is before the source's history start (${config.historyStartsOn}); row excluded.`);
        context = null;
        continue;
      }
      workDate = date.value;
      scribe = canonical.get(rawName.toLowerCase()) ?? rawName;
      context = { workDate, scribe };
    } else if (!has("workDate") && !has("scribe")) {
      const continuationShape = has("facilities") && has("serviceDate") && !TIME_FIELDS.some(has);
      if (!continuationShape || !context) {
        flag("UNATTRIBUTED_ROW", "warning", undefined, "Row has no DATE/SCRIBE and does not match the continuation structure; excluded.");
        context = null;
        continue;
      }
      ({ workDate, scribe } = context);
      inherited = true;
      flag("INHERITED_ATTRIBUTION", "info", undefined, "DATE and SCRIBE inherited from the preceding row (continuation line).", undefined, scribe);
    } else {
      flag("MISSING_ATTRIBUTION", "warning", has("workDate") ? "scribe" : "workDate", "Row has only one of DATE / SCRIBE; excluded.");
      context = null;
      continue;
    }

    if (workDate > input.today) flag("FUTURE_DATE", "warning", "workDate", "Work DATE is in the future.", undefined, scribe);

    // ── Hours ──
    const times = {} as Record<"clockIn" | "startBreak" | "endBreak" | "clockOut", number | null>;
    for (const f of ["clockIn", "startBreak", "endBreak", "clockOut"] as const) {
      const t = parseTime(cell(f));
      times[f] = t.ok ? t.value : null;
      if (!t.ok) flag("INVALID_TIME", "warning", f, `${f} is not a readable time.`, cell(f), scribe);
    }
    let storedHours: number | null = null;
    const th = cell("totalHours");
    if (typeof th === "number" && th >= 0 && th < 1) storedHours = th * 24;
    else if (!isBlank(th)) flag("INVALID_HOURS", "warning", "totalHours", "TOTAL HOURS is not a duration under 24 hours; excluded from hours.", th, scribe);

    let clockHours: number | null = null;
    let crossesMidnight = false;
    if (times.clockIn !== null && times.clockOut !== null) {
      let span = times.clockOut - times.clockIn;
      if (span < 0) {
        span += 1;
        crossesMidnight = true;
      }
      const oneBreakCell = (times.startBreak === null) !== (times.endBreak === null);
      if (oneBreakCell) {
        flag("BREAK_INCOMPLETE", "warning", times.startBreak === null ? "startBreak" : "endBreak", "Only one break time is filled in; clock-derived hours not computed.", undefined, scribe);
      } else {
        const brk = times.startBreak !== null && times.endBreak !== null ? (((times.endBreak - times.startBreak) % 1) + 1) % 1 : 0;
        clockHours = (span - brk) * 24;
      }
      if (storedHours === null && isBlank(th)) flag("MISSING_HOURS", "warning", "totalHours", "Clock times are filled in but TOTAL HOURS is blank; no hours counted.", undefined, scribe);
    }
    if (storedHours !== null && clockHours !== null && Math.abs(storedHours - clockHours) * 60 > config.hoursToleranceMinutes) {
      flag(
        "HOURS_MISMATCH",
        "warning",
        "totalHours",
        `Stored TOTAL HOURS differs from clock times by more than ${config.hoursToleranceMinutes} minutes; stored value used.`,
        undefined,
        scribe,
      );
    }
    if (storedHours !== null && storedHours * 60 < config.shortSessionMinutes) {
      flag("SHORT_SESSION", "info", "totalHours", `Session shorter than ${config.shortSessionMinutes} minutes (kept as recorded).`, undefined, scribe);
    }
    if (storedHours !== null && storedHours > config.longSessionHours) {
      flag("LONG_SESSION", "info", "totalHours", `Session longer than ${config.longSessionHours} hours (kept as recorded).`, undefined, scribe);
    }

    // ── Counts ──
    const counts = {} as Record<"consultNotes" | "progressNotes" | "total" | "uploadedNotes", number | null>;
    for (const f of ["consultNotes", "progressNotes", "total", "uploadedNotes"] as const) {
      const p = parseCount(cell(f));
      counts[f] = p.ok ? p.value : null;
      if (!p.ok) flag("INVALID_NUMBER", "warning", f, `${f} is not a whole non-negative number; value ignored.`, cell(f), scribe);
    }
    if (isBlank(cell("total")) && (counts.consultNotes || counts.progressNotes)) {
      flag("MISSING_TOTAL", "warning", "total", "TOTAL is blank but CONSULT/PROGRESS notes are filled in; notes not counted (TOTAL is authoritative).", undefined, scribe);
    }
    if (counts.total !== null && parseCount(cell("consultNotes")).ok && parseCount(cell("progressNotes")).ok) {
      const sum = (counts.consultNotes ?? 0) + (counts.progressNotes ?? 0);
      if (sum !== counts.total) flag("TOTAL_MISMATCH", "warning", "total", `TOTAL (${counts.total}) does not equal CONSULT + PROGRESS (${sum}).`, undefined, scribe);
    }

    // ── Facilities (internal only) ──
    const facilities = has("facilities") ? String(cell("facilities")).trim() : null;
    const multiFacility = !!facilities && config.multiFacilitySeparators.some((s) => facilities.includes(s));
    if (multiFacility) flag("MULTI_FACILITY", "info", "facilities", "Entry names several facilities; production left unallocated.", undefined, scribe);

    const extra = cell("extraNotes");
    rows.push({
      scribe,
      tab,
      sheetId,
      row: rowNumber,
      workDate,
      inheritedAttribution: inherited,
      storedHours: storedHours === null ? null : clean(storedHours),
      clockHours: clockHours === null ? null : clean(clockHours),
      crossesMidnight,
      isSession: times.clockIn !== null || times.clockOut !== null || storedHours !== null,
      facilities,
      multiFacility,
      consultNotes: counts.consultNotes,
      progressNotes: counts.progressNotes,
      total: counts.total,
      uploadedNotes: counts.uploadedNotes,
      ...(typeof extra === "string" && extra.trim() ? { extraNotesPattern: normalizeFreeText(extra) } : {}),
    });
  }
  return { rows, issues, skippedRows };
}
