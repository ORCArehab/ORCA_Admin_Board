import { readFileSync, existsSync } from "node:fs";
import { z } from "zod";
import type { Env } from "./env.js";

/**
 * Allowlist of operational spreadsheets the backend may read.
 * Only sources listed here are ever fetched; the Sheets client rejects any other ID.
 * Spreadsheet IDs come from the environment, never from source control.
 */
export type SourceKey = "providerTracker";

export interface SheetSource {
  key: SourceKey;
  /** Human label, used in logs and API metadata. */
  label: string;
  spreadsheetId: string;
}

export function loadSheetSources(env: Env): Partial<Record<SourceKey, SheetSource>> {
  const sources: Partial<Record<SourceKey, SheetSource>> = {};
  if (env.PROVIDER_TRACKER_SPREADSHEET_ID) {
    sources.providerTracker = {
      key: "providerTracker",
      label: "ORCA-NP/Scribe Tracker 2026",
      spreadsheetId: env.PROVIDER_TRACKER_SPREADSHEET_ID,
    };
  }
  return sources;
}

/**
 * Provider-tracker specific configuration. Lives in a (gitignored) JSON file or
 * inline env JSON so provider names and tab quirks can change without code changes.
 *
 * Tab references accept either the exact tab title ("NP - JD") or its stable
 * numeric sheet id prefixed with "gid:" ("gid:123456789"), which survives renames.
 */
export const ProviderTrackerConfigSchema = z.object({
  /**
   * Tab reference → canonical provider display name.
   * Every mapped tab is treated as an *expected* provider tab: if it disappears or
   * loses required columns, that is reported as a structural error.
   * Several tabs may map to the same provider; their rows are combined.
   */
  providers: z.record(z.string(), z.string().min(1)).default({}),
  /** Tabs never treated as provider tabs (summary/BILLER/etc.), even if their headers match. */
  excludeTabs: z.array(z.string()).default([]),
  /**
   * Whether tabs that look like provider tabs but are not in `providers` are included
   * (named by tab title, flagged UNMAPPED_TAB) or ignored.
   */
  unmappedTabs: z.enum(["include", "ignore"]).default("include"),
  /** How many rows from the top of each tab to search for the header row. */
  headerScanRows: z.number().int().positive().default(15),
  /** Extra header spellings per field, merged with the built-in aliases. */
  columnAliases: z.record(z.string(), z.array(z.string())).default({}),
  /** Substrings in FACILITIES that indicate several facilities combined into one row. */
  multiFacilitySeparators: z.array(z.string()).default(["/", ",", ";", "+", "\n"]),
});

export type ProviderTrackerConfig = z.infer<typeof ProviderTrackerConfigSchema>;

export function loadProviderTrackerConfig(env: Env): ProviderTrackerConfig {
  let raw: unknown = {};
  if (env.PROVIDER_TRACKER_CONFIG_JSON) {
    raw = JSON.parse(env.PROVIDER_TRACKER_CONFIG_JSON);
  } else if (existsSync(env.PROVIDER_TRACKER_CONFIG_PATH)) {
    raw = JSON.parse(readFileSync(env.PROVIDER_TRACKER_CONFIG_PATH, "utf8"));
  }
  const parsed = ProviderTrackerConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid provider tracker config:\n${details}`);
  }
  return parsed.data;
}
