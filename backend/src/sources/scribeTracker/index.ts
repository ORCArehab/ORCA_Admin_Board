import type { ScribeTrackerConfig } from "../../config/sources.js";
import type { SpreadsheetSnapshot, TabValues } from "../../integrations/google/sheets.js";
import type { DataQualityIssue } from "../../lib/dataQuality.js";
import type { IsoDate } from "../../lib/dates.js";
import { tabRefMatches } from "../../lib/tabRefs.js";
import { findScribeHeader, type ScribeHeader } from "./columns.js";
import { parseScribeTab } from "./parseRows.js";
import { REQUIRED_SCRIBE_FIELDS, type ScribeRow } from "./types.js";

export type { ScribeRow } from "./types.js";

export interface ScribeTrackerData {
  /** The production tab used, if one was found. */
  sourceTab: { title: string; sheetId: number; headerRow: number; parsedRows: number; skippedRows: number } | null;
  rows: ScribeRow[];
  issues: DataQualityIssue[];
}

function structural(code: string, message: string, tab?: TabValues): DataQualityIssue {
  return { code, severity: "error", scope: "structure", message, ...(tab ? { tab: tab.title, sheetId: tab.sheetId } : {}) };
}

/**
 * Snapshot of the scribe tracker → typed Daily Production rows. Pure.
 * V1 reads only the production tab; per-scribe history tabs are intentionally ignored.
 */
export function readScribeTracker(snapshot: SpreadsheetSnapshot, config: ScribeTrackerConfig, today: IsoDate): ScribeTrackerData {
  const withHeader = snapshot.tabs.map((tab) => ({ tab, header: findScribeHeader(tab.values, config.headerScanRows) }));
  const complete = (h: ScribeHeader | null) => !!h && REQUIRED_SCRIBE_FIELDS.every((f) => h.columns[f] !== undefined);

  let chosen: { tab: TabValues; header: ScribeHeader | null } | undefined;
  if (config.productionTab) {
    chosen = withHeader.find((c) => tabRefMatches(config.productionTab!, c.tab));
    if (!chosen) return { sourceTab: null, rows: [], issues: [structural("PRODUCTION_TAB_NOT_FOUND", `Configured production tab "${config.productionTab}" does not exist.`)] };
  } else {
    const candidates = withHeader.filter((c) => complete(c.header));
    if (candidates.length !== 1) {
      return {
        sourceTab: null,
        rows: [],
        issues: [
          structural(
            candidates.length === 0 ? "PRODUCTION_TAB_NOT_FOUND" : "AMBIGUOUS_PRODUCTION_TAB",
            candidates.length === 0
              ? "No tab has the Daily Production columns (DATE, SCRIBE, TOTAL HOURS, TOTAL, UPLOADED NOTES)."
              : `Several tabs look like the production tab (${candidates.map((c) => `"${c.tab.title}"`).join(", ")}); set productionTab in config.`,
          ),
        ],
      };
    }
    chosen = candidates[0];
  }

  const { tab, header } = chosen!;
  if (!header || !complete(header)) {
    const missing = REQUIRED_SCRIBE_FIELDS.filter((f) => header?.columns[f] === undefined);
    return { sourceTab: null, rows: [], issues: [structural("MISSING_REQUIRED_COLUMNS", `Production tab "${tab.title}" is missing required column(s): ${missing.join(", ")}.`, tab)] };
  }

  const issues: DataQualityIssue[] = [];
  for (const f of ["clockIn", "clockOut", "facilities", "serviceDate"] as const) {
    if (header.columns[f] === undefined) {
      issues.push({ code: "MISSING_OPTIONAL_COLUMN", severity: "warning", scope: "structure", tab: tab.title, sheetId: tab.sheetId, column: f, message: `Production tab has no ${f} column; related checks are skipped.` });
    }
  }
  const parsed = parseScribeTab({ tab: tab.title, sheetId: tab.sheetId, values: tab.values, header, config, today });
  return {
    sourceTab: { title: tab.title, sheetId: tab.sheetId, headerRow: header.rowIndex + 1, parsedRows: parsed.rows.length, skippedRows: parsed.skippedRows },
    rows: parsed.rows,
    issues: [...issues, ...parsed.issues],
  };
}
