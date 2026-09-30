import { readFileSync, existsSync } from "node:fs";
import { z } from "zod";
import type { Env } from "./env.js";

/**
 * Allowlist of operational spreadsheets the backend may read.
 * Only sources listed here are ever fetched; the Sheets client rejects any other ID.
 * Spreadsheet IDs come from the environment, never from source control.
 */
export type SourceKey = "providerTracker" | "scribeTracker";

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
  if (env.SCRIBE_TRACKER_SPREADSHEET_ID) {
    sources.scribeTracker = {
      key: "scribeTracker",
      label: "ORCA-REMOWORKS-Scribe Tracker 2026",
      spreadsheetId: env.SCRIBE_TRACKER_SPREADSHEET_ID,
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
  return loadJsonConfig(ProviderTrackerConfigSchema, env.PROVIDER_TRACKER_CONFIG_JSON, env.PROVIDER_TRACKER_CONFIG_PATH, "provider tracker");
}

/**
 * Scribe-tracker configuration (V1 source of truth: the "Daily Production" tab only).
 * Tab references use the same "Tab Title" / "gid:123" form as the provider config.
 */
export const ScribeTrackerConfigSchema = z.object({
  /**
   * The production tab. When omitted, the single tab whose header has SCRIBE, CLOCK IN,
   * TOTAL HOURS, TOTAL and UPLOADED NOTES is used (per-scribe tabs have no SCRIBE column).
   */
  productionTab: z.string().optional(),
  /** Scribe name as written in the sheet → canonical display name. Unlisted names are used as written. */
  scribes: z.record(z.string(), z.string().min(1)).default({}),
  /**
   * First work date covered by the source. Rows dated earlier are flagged and excluded, and
   * the API reports this as the start of available history.
   */
  historyStartsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Stored vs clock-derived hours may differ by this much before a warning is raised. */
  hoursToleranceMinutes: z.number().nonnegative().default(15),
  /** Sessions shorter / longer than these are flagged as data-quality information (never changed). */
  shortSessionMinutes: z.number().nonnegative().default(15),
  longSessionHours: z.number().positive().default(12),
  headerScanRows: z.number().int().positive().default(10),
  multiFacilitySeparators: z.array(z.string()).default(["/", ",", ";", "+", "\n"]),
});

export type ScribeTrackerConfig = z.infer<typeof ScribeTrackerConfigSchema>;

export function loadScribeTrackerConfig(env: Env): ScribeTrackerConfig {
  return loadJsonConfig(ScribeTrackerConfigSchema, env.SCRIBE_TRACKER_CONFIG_JSON, env.SCRIBE_TRACKER_CONFIG_PATH, "scribe tracker");
}

function loadJsonConfig<S extends z.ZodType>(schema: S, inline: string | undefined, path: string, label: string): z.infer<S> {
  let raw: unknown = {};
  if (inline) raw = JSON.parse(inline);
  else if (existsSync(path)) raw = JSON.parse(readFileSync(path, "utf8"));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid ${label} config:\n${details}`);
  }
  return parsed.data;
}
