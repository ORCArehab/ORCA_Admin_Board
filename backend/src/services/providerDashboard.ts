import type { ProviderTrackerConfig, SheetSource } from "../config/sources.js";
import type { SheetsReader, SpreadsheetSnapshot } from "../integrations/google/sheets.js";
import { TtlCache } from "../lib/cache.js";
import { summarizeIssues, type DataQualityIssue } from "../lib/dataQuality.js";
import { todayInTimeZone, type IsoDate } from "../lib/dates.js";
import { AppError, fromGoogleError } from "../lib/errors.js";
import { BACKLOG_BASIS } from "../metrics/provider/backlogRules.js";
import { COMPLETION_BASIS } from "../metrics/provider/completionModel.js";
import { computeProviderMetrics, type ProviderMetrics } from "../metrics/provider/computeProviderMetrics.js";
import { readProviderTracker, type TrackerTabSummary } from "../sources/providerTracker/index.js";
import { summarizeStatusTextPatterns, type StatusTextPatternCount } from "../sources/providerTracker/statusText.js";

export interface ProviderDashboardEntry extends ProviderMetrics {
  /** "incomplete" when a structural error means some of this provider's notes could not be read. */
  dataStatus: "ok" | "incomplete";
  /** Row-level warnings for this provider (details in dataQuality.rowIssues). */
  warningCount: number;
  /** Tracker tabs contributing to this provider. */
  tabs: string[];
}

export interface ProviderDashboard {
  meta: {
    generatedAt: string;
    asOfDate: IsoDate;
    timezone: string;
    completionBasis: typeof COMPLETION_BASIS;
    /** Human-readable definitions the frontend can show next to percentages. */
    definitions: typeof METRIC_DEFINITIONS;
    /** Dataset-wide share of notes with an explicit upload status. */
    statusCoverage: {
      expectedNotes: number;
      classifiedNotes: number;
      unknownStatusNotes: number;
      classifiedPercent: number | null;
      /** Providers whose completionRate is a lower bound because some notes have unknown status. */
      providersWithUnknownStatus: string[];
    };
    backlogBasis: typeof BACKLOG_BASIS;
    source: { label: string; spreadsheetTitle: string; fetchedAt: string };
    tabs: TrackerTabSummary[];
  };
  providers: ProviderDashboardEntry[];
  dataQuality: {
    summary: Record<string, number>;
    structuralIssues: DataQualityIssue[];
    rowIssues: DataQualityIssue[];
    /** Normalized free-text patterns in status columns (never raw text); input for future normalization rules. */
    statusTextPatterns: StatusTextPatternCount[];
  };
}

export const METRIC_DEFINITIONS = {
  completionRate:
    "completedNotes / expectedNotes. Notes with unknown upload status (blank or free text) stay in the denominator, so this is a lower bound when statusCoveragePercent < 100.",
  statusCoveragePercent: "Share of expected notes whose UPLOADED NOTES cell is an explicit TRUE/FALSE checkbox.",
  unknownStatusNotes: "Notes whose UPLOADED NOTES cell is blank or free text. Not counted as completed or outstanding.",
  outstandingBatches: "Rows with TOTAL > 0 and UPLOADED NOTES = FALSE.",
} as const;

/** Snapshot → dashboard payload. Pure, so the whole pipeline is testable with fixtures. */
export function buildProviderDashboard(
  snapshot: SpreadsheetSnapshot,
  config: ProviderTrackerConfig,
  opts: { today: IsoDate; timezone: string; sourceLabel: string; now?: Date },
): ProviderDashboard {
  const tracker = readProviderTracker(snapshot, config, opts.today);
  const metrics = computeProviderMetrics(tracker.providers, tracker.rows, opts.today);

  const structuralIssues = tracker.issues.filter((i) => i.scope === "structure");
  const rowIssues = tracker.issues.filter((i) => i.scope === "row");

  const providers: ProviderDashboardEntry[] = metrics.map((m) => ({
    ...m,
    dataStatus: structuralIssues.some((i) => i.provider === m.name && i.severity === "error") ? "incomplete" : "ok",
    warningCount: rowIssues.filter((i) => i.provider === m.name && i.severity !== "info").length,
    tabs: tracker.tabs.filter((t) => t.provider === m.name).map((t) => t.title),
  }));

  return {
    meta: {
      generatedAt: (opts.now ?? new Date()).toISOString(),
      asOfDate: opts.today,
      timezone: opts.timezone,
      completionBasis: COMPLETION_BASIS,
      definitions: METRIC_DEFINITIONS,
      statusCoverage: statusCoverage(metrics),
      backlogBasis: BACKLOG_BASIS,
      source: { label: opts.sourceLabel, spreadsheetTitle: snapshot.title, fetchedAt: snapshot.fetchedAt },
      tabs: tracker.tabs,
    },
    providers,
    dataQuality: {
      summary: summarizeIssues(tracker.issues),
      structuralIssues,
      rowIssues,
      statusTextPatterns: summarizeStatusTextPatterns(tracker.rows),
    },
  };
}

export interface ProviderDashboardServiceDeps {
  reader: SheetsReader;
  source: SheetSource | undefined;
  config: ProviderTrackerConfig;
  timezone: string;
  cacheTtlMs: number;
  now?: () => Date;
}

/** Fetches the provider tracker, runs the pipeline, and caches the result. */
export class ProviderDashboardService {
  private readonly cache: TtlCache<ProviderDashboard>;
  private readonly now: () => Date;

  constructor(private readonly deps: ProviderDashboardServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.cache = new TtlCache(deps.cacheTtlMs, () => this.now().getTime());
  }

  async getDashboard(opts: { refresh?: boolean } = {}): Promise<{ data: ProviderDashboard; cached: boolean }> {
    const source = this.deps.source;
    if (!source) {
      throw new AppError(503, "SOURCE_NOT_CONFIGURED", "PROVIDER_TRACKER_SPREADSHEET_ID is not configured.");
    }
    const result = await this.cache.get(async () => {
      let snapshot: SpreadsheetSnapshot;
      try {
        snapshot = await this.deps.reader.readSpreadsheet(source.spreadsheetId);
      } catch (err) {
        throw err instanceof AppError ? err : fromGoogleError(err, source.label);
      }
      const now = this.now();
      return buildProviderDashboard(snapshot, this.deps.config, {
        today: todayInTimeZone(this.deps.timezone, now),
        timezone: this.deps.timezone,
        sourceLabel: source.label,
        now,
      });
    }, opts);
    return { data: result.data, cached: result.cached };
  }
}

function statusCoverage(metrics: ProviderMetrics[]): ProviderDashboard["meta"]["statusCoverage"] {
  const sum = (k: "expectedNotes" | "classifiedNotes" | "unknownStatusNotes") => metrics.reduce((a, m) => a + m[k], 0);
  const expectedNotes = sum("expectedNotes");
  const classifiedNotes = sum("classifiedNotes");
  return {
    expectedNotes,
    classifiedNotes,
    unknownStatusNotes: sum("unknownStatusNotes"),
    classifiedPercent: expectedNotes > 0 ? Math.round((classifiedNotes / expectedNotes) * 1000) / 10 : null,
    providersWithUnknownStatus: metrics.filter((m) => m.unknownStatusNotes > 0).map((m) => m.name),
  };
}
