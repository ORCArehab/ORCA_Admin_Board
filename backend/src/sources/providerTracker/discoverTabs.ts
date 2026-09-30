import type { ProviderTrackerConfig } from "../../config/sources.js";
import type { DataQualityIssue } from "../../lib/dataQuality.js";
import type { SheetTab, TabValues } from "../../integrations/google/sheets.js";
import { buildAliasLookup, findHeaderRow, type HeaderMatch } from "./columns.js";
import { REQUIRED_PROVIDER_FIELDS, type ProviderField } from "./types.js";

export type TabStatus =
  /** Valid provider tab; rows will be parsed. */
  | "provider"
  /** Listed in config `excludeTabs`. */
  | "excluded"
  /** Looks like a provider tab but is unmapped and config says `unmappedTabs: "ignore"`. */
  | "unmapped-ignored"
  /** Mapped provider tab that is structurally broken (no header / missing required columns). */
  | "invalid"
  /** Not a provider tab (no matching header). */
  | "not-provider";

export interface TabClassification {
  tab: SheetTab;
  status: TabStatus;
  providerName?: string;
  nameSource?: "config" | "tabTitle";
  header?: HeaderMatch;
  missingColumns?: ProviderField[];
}

export interface DiscoveryResult {
  tabs: TabClassification[];
  issues: DataQualityIssue[];
}

/** Does a config tab reference ("Tab Title" or "gid:123") point at this tab? */
export function tabRefMatches(ref: string, tab: SheetTab): boolean {
  const trimmed = ref.trim();
  if (trimmed.toLowerCase().startsWith("gid:")) return trimmed.slice(4).trim() === String(tab.sheetId);
  return trimmed === tab.title.trim();
}

function findMappedName(config: ProviderTrackerConfig, tab: SheetTab): string | undefined {
  // Prefer gid refs (stable across renames) over title refs.
  const entries = Object.entries(config.providers);
  const byGid = entries.find(([ref]) => ref.trim().toLowerCase().startsWith("gid:") && tabRefMatches(ref, tab));
  const byTitle = entries.find(([ref]) => tabRefMatches(ref, tab));
  return (byGid ?? byTitle)?.[1];
}

/**
 * Classify every tab in the tracker. Pure: works on already-fetched values.
 * Provider tabs are recognised by their header row, never by position or name.
 * Inclusion is decided by config (providers / excludeTabs / unmappedTabs), never by
 * whether a tab is hidden in Google Sheets.
 */
export function discoverProviderTabs(tabs: TabValues[], config: ProviderTrackerConfig): DiscoveryResult {
  const lookup = buildAliasLookup(config.columnAliases);
  const issues: DataQualityIssue[] = [];
  const results: TabClassification[] = [];

  for (const tabValues of tabs) {
    const { values, ...tab } = tabValues;
    const base = { tab };

    if (config.excludeTabs.some((ref) => tabRefMatches(ref, tab))) {
      results.push({ ...base, status: "excluded" });
      continue;
    }

    const mappedName = findMappedName(config, tab);
    const header = findHeaderRow(values, lookup, config.headerScanRows) ?? undefined;
    const missingColumns = REQUIRED_PROVIDER_FIELDS.filter((f) => header?.columns[f] === undefined);

    if (header && missingColumns.length === 0) {
      if (!mappedName && config.unmappedTabs === "ignore") {
        results.push({ ...base, status: "unmapped-ignored", header });
        continue;
      }
      if (!mappedName) {
        issues.push({
          code: "UNMAPPED_TAB",
          severity: "info",
          scope: "structure",
          tab: tab.title,
          sheetId: tab.sheetId,
          message: `Provider tab "${tab.title}" has no entry in config "providers"; using the tab title as the provider name.`,
        });
      }
      for (const field of header.duplicates) {
        issues.push({
          code: "DUPLICATE_COLUMN",
          severity: "info",
          scope: "structure",
          tab: tab.title,
          sheetId: tab.sheetId,
          column: field,
          message: `Column "${field}" appears more than once in "${tab.title}"; using the first occurrence.`,
        });
      }
      results.push({
        ...base,
        status: "provider",
        header,
        providerName: mappedName ?? tab.title.trim(),
        nameSource: mappedName ? "config" : "tabTitle",
      });
      continue;
    }

    if (mappedName) {
      // An expected provider tab no longer has the structure we need: surface loudly.
      issues.push({
        code: header ? "MISSING_REQUIRED_COLUMNS" : "NO_HEADER_ROW",
        severity: "error",
        scope: "structure",
        tab: tab.title,
        sheetId: tab.sheetId,
        provider: mappedName,
        message: header
          ? `Provider tab "${tab.title}" is missing required column(s): ${missingColumns.join(", ")}. Its notes are not counted.`
          : `Provider tab "${tab.title}" has no recognisable header row in the first ${config.headerScanRows} rows. Its notes are not counted.`,
      });
      results.push({ ...base, status: "invalid", providerName: mappedName, nameSource: "config", header, missingColumns });
      continue;
    }

    if (header && missingColumns.length < REQUIRED_PROVIDER_FIELDS.length - 1) {
      // Unmapped tab that nearly matches: probably a provider tab with a renamed column.
      issues.push({
        code: "POSSIBLE_PROVIDER_TAB",
        severity: "warning",
        scope: "structure",
        tab: tab.title,
        sheetId: tab.sheetId,
        message: `Tab "${tab.title}" looks like a provider tab but is missing: ${missingColumns.join(", ")}. It was ignored; map or exclude it in config.`,
      });
    }
    results.push({ ...base, status: "not-provider", header, missingColumns });
  }

  // Mapped tabs that no longer exist at all.
  for (const [ref, name] of Object.entries(config.providers)) {
    if (!tabs.some((t) => tabRefMatches(ref, t))) {
      issues.push({
        code: "MAPPED_TAB_NOT_FOUND",
        severity: "error",
        scope: "structure",
        provider: name,
        message: `Config maps tab "${ref}" to provider "${name}", but no such tab exists in the tracker.`,
      });
    }
  }

  return { tabs: results, issues };
}
