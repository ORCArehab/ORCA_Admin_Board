import type { ProviderTrackerConfig } from "../../config/sources.js";
import type { SpreadsheetSnapshot } from "../../integrations/google/sheets.js";
import type { DataQualityIssue } from "../../lib/dataQuality.js";
import type { IsoDate } from "../../lib/dates.js";
import { discoverProviderTabs, type TabStatus } from "./discoverTabs.js";
import { parseProviderTab } from "./parseRows.js";
import type { ProviderRow } from "./types.js";

export type { ProviderRow, CheckState } from "./types.js";

export interface TrackerTabSummary {
  title: string;
  sheetId: number;
  hidden: boolean;
  status: TabStatus;
  provider?: string;
  nameSource?: "config" | "tabTitle";
  /** 1-based header row number, when one was found. */
  headerRow?: number;
  parsedRows?: number;
  skippedRows?: number;
  missingColumns?: string[];
}

export interface ProviderTrackerData {
  /** Canonical provider names, including providers whose tabs are structurally invalid. */
  providers: string[];
  rows: ProviderRow[];
  issues: DataQualityIssue[];
  tabs: TrackerTabSummary[];
}

/**
 * Snapshot of the ORCA-NP/Scribe Tracker → typed provider rows + data-quality issues.
 * Pure: no I/O, so it can be tested against fixtures.
 */
export function readProviderTracker(
  snapshot: SpreadsheetSnapshot,
  config: ProviderTrackerConfig,
  today: IsoDate,
): ProviderTrackerData {
  const discovery = discoverProviderTabs(snapshot.tabs, config);
  const issues = [...discovery.issues];
  const rows: ProviderRow[] = [];
  const providers = new Set<string>();
  const tabs: TrackerTabSummary[] = [];

  for (const c of discovery.tabs) {
    const summary: TrackerTabSummary = {
      title: c.tab.title,
      sheetId: c.tab.sheetId,
      hidden: c.tab.hidden,
      status: c.status,
      provider: c.providerName,
      nameSource: c.nameSource,
      headerRow: c.header ? c.header.rowIndex + 1 : undefined,
      missingColumns: c.missingColumns?.length ? c.missingColumns : undefined,
    };

    if (c.status === "invalid" && c.providerName) providers.add(c.providerName);

    if (c.status === "provider" && c.header && c.providerName) {
      providers.add(c.providerName);
      const values = snapshot.tabs.find((t) => t.sheetId === c.tab.sheetId)?.values ?? [];
      const parsed = parseProviderTab({
        provider: c.providerName,
        tab: c.tab.title,
        sheetId: c.tab.sheetId,
        values,
        header: c.header,
        multiFacilitySeparators: config.multiFacilitySeparators,
        columnAliases: config.columnAliases,
        today,
      });
      rows.push(...parsed.rows);
      issues.push(...parsed.issues);
      summary.parsedRows = parsed.rows.length;
      summary.skippedRows = parsed.skippedRows;
    }
    tabs.push(summary);
  }

  return { providers: [...providers], rows, issues, tabs };
}
