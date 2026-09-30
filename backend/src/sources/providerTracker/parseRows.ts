import type { CellValue } from "../../integrations/google/sheets.js";
import type { DataQualityIssue } from "../../lib/dataQuality.js";
import { fromSheetsSerial, parseDateString, type IsoDate } from "../../lib/dates.js";
import { buildAliasLookup, matchHeaderRow, matchedFieldCount, type HeaderMatch } from "./columns.js";
import type { CheckState, ProviderField, ProviderRow } from "./types.js";

export interface ParseTabInput {
  provider: string;
  tab: string;
  sheetId: number;
  values: CellValue[][];
  header: HeaderMatch;
  multiFacilitySeparators: string[];
  columnAliases?: Record<string, string[]>;
  /** Today's date, used to flag visit dates in the future. */
  today: IsoDate;
}

export interface ParseTabResult {
  rows: ProviderRow[];
  issues: DataQualityIssue[];
  /** Rows skipped as blank, repeated headers or section labels (not errors). */
  skippedRows: number;
}

const isBlank = (v: CellValue | undefined): boolean => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

type Parsed<T> = { ok: true; value: T } | { ok: false };

function parseDate(v: CellValue | undefined): Parsed<IsoDate | null> {
  if (isBlank(v)) return { ok: true, value: null };
  const iso = typeof v === "number" ? fromSheetsSerial(v) : typeof v === "string" ? parseDateString(v) : null;
  return iso ? { ok: true, value: iso } : { ok: false };
}

/** Non-negative whole number. Numeric text ("5") is accepted; anything else is invalid. */
function parseCount(v: CellValue | undefined): Parsed<number | null> {
  if (isBlank(v)) return { ok: true, value: null };
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*\d+(\.\d+)?\s*$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 ? { ok: true, value: n } : { ok: false };
}

function parseCheck(v: CellValue | undefined): CheckState {
  if (isBlank(v)) return "blank";
  if (v === true) return "checked";
  if (v === false) return "unchecked";
  if (typeof v === "string") {
    const s = v.trim().toUpperCase();
    if (s === "TRUE") return "checked";
    if (s === "FALSE") return "unchecked";
  }
  return "unrecognized";
}

/**
 * Parse the data rows of one provider tab into typed rows.
 *
 * Questionable rows are flagged, never repaired:
 *  - an unreadable TOTAL leaves `total: null` (row excluded from note counts)
 *  - an unreadable VISIT DATE leaves `visitDate: null` (row still counted, excluded from age)
 */
export function parseProviderTab(input: ParseTabInput): ParseTabResult {
  const { header, values, provider, tab, sheetId } = input;
  const cols = header.columns;
  const lookup = buildAliasLookup(input.columnAliases);
  const rows: ProviderRow[] = [];
  const issues: DataQualityIssue[] = [];
  let skippedRows = 0;

  for (let i = header.rowIndex + 1; i < values.length; i++) {
    const cells = values[i] ?? [];
    const rowNumber = i + 1;
    const cell = (f: ProviderField): CellValue | undefined => (cols[f] === undefined ? undefined : cells[cols[f]!]);
    const flag = (code: string, severity: DataQualityIssue["severity"], column: ProviderField | undefined, message: string, value?: CellValue) =>
      issues.push({ code, severity, scope: "row", tab, sheetId, row: rowNumber, provider, column, message, ...(value !== undefined ? { value } : {}) });

    const content: ProviderField[] = ["visitDate", "facilities", "consultNotes", "progressNotes", "total"];
    const statusFields: ProviderField[] = ["uploadedNotes", "billingSheet", "faceSheet"];
    const hasContent = content.some((f) => !isBlank(cell(f)));

    if (!hasContent) {
      // Blank or template row (pre-filled unchecked boxes). A checked box with no data is suspicious.
      if (statusFields.some((f) => parseCheck(cell(f)) === "checked")) {
        flag("STATUS_WITHOUT_DATA", "warning", undefined, "Row has a checked status box but no visit date, facility or note counts.");
      }
      skippedRows++;
      continue;
    }

    // Repeated header rows (e.g. one header block per month).
    if (matchedFieldCount(matchHeaderRow(cells, lookup, i)) >= 2) {
      skippedRows++;
      continue;
    }

    // Section label rows: text in the visit-date column only (e.g. "SEPTEMBER").
    const dateCell = cell("visitDate");
    const onlyDateText =
      typeof dateCell === "string" && content.every((f) => f === "visitDate" || isBlank(cell(f))) && parseDate(dateCell).ok === false;
    if (onlyDateText) {
      skippedRows++;
      continue;
    }

    const date = parseDate(dateCell);
    if (!date.ok) flag("INVALID_DATE", "warning", "visitDate", "VISIT DATE is not a readable date; row excluded from outstanding-age calculations.", dateCell);
    else if (date.value && date.value > input.today) flag("FUTURE_DATE", "warning", "visitDate", "VISIT DATE is in the future.", date.value);

    const counts = {} as Record<"consultNotes" | "progressNotes" | "total", number | null>;
    for (const f of ["consultNotes", "progressNotes", "total"] as const) {
      const parsed = parseCount(cell(f));
      counts[f] = parsed.ok ? parsed.value : null;
      if (!parsed.ok) flag("INVALID_NUMBER", "warning", f, `${f} is not a whole non-negative number; value ignored.`, cell(f));
    }
    if (isBlank(cell("total"))) {
      flag("MISSING_TOTAL", "warning", "total", "TOTAL is blank; row excluded from note counts.");
    }

    const hasComponents = cols.consultNotes !== undefined && cols.progressNotes !== undefined;
    if (hasComponents && counts.total !== null && parseCount(cell("consultNotes")).ok && parseCount(cell("progressNotes")).ok) {
      const sum = (counts.consultNotes ?? 0) + (counts.progressNotes ?? 0);
      if (sum !== counts.total) {
        flag("TOTAL_MISMATCH", "warning", "total", `TOTAL (${counts.total}) does not equal CONSULT + PROGRESS (${sum}).`, counts.total);
      }
    }

    const statuses = {} as Record<"uploadedNotes" | "billingSheet" | "faceSheet", CheckState | null>;
    for (const f of statusFields as ("uploadedNotes" | "billingSheet" | "faceSheet")[]) {
      if (cols[f] === undefined) {
        statuses[f] = null;
        continue;
      }
      const state = parseCheck(cell(f));
      statuses[f] = state;
      if (state === "unrecognized") flag("UNEXPECTED_STATUS", "warning", f, `${f} has an unexpected value (expected TRUE/FALSE).`, cell(f));
    }
    if ((counts.total ?? 0) > 0 && statuses.uploadedNotes === "blank") {
      flag("MISSING_STATUS", "warning", "uploadedNotes", "UPLOADED NOTES is blank for a row with notes; upload status unknown.");
    }

    const facilitiesRaw = cell("facilities");
    const facilities = isBlank(facilitiesRaw) ? null : String(facilitiesRaw).trim();
    const multiFacility = !!facilities && input.multiFacilitySeparators.some((sep) => facilities.includes(sep));
    if (multiFacility) {
      flag("MULTI_FACILITY", "info", "facilities", "Row combines several facilities under one TOTAL; treated as an unallocated multi-facility batch.", facilities);
    }

    rows.push({
      provider,
      tab,
      sheetId,
      row: rowNumber,
      visitDate: date.ok ? date.value : null,
      facilities,
      multiFacility,
      consultNotes: counts.consultNotes,
      progressNotes: counts.progressNotes,
      total: counts.total,
      uploadedNotes: statuses.uploadedNotes ?? "blank",
      billingSheet: statuses.billingSheet,
      faceSheet: statuses.faceSheet,
    });
  }

  return { rows, issues, skippedRows };
}
