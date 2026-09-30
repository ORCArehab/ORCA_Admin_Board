import type { ScribeTrackerConfig, SheetSource } from "../config/sources.js";
import type { SheetsReader, SpreadsheetSnapshot } from "../integrations/google/sheets.js";
import { TtlCache } from "../lib/cache.js";
import { summarizeIssues, type DataQualityIssue } from "../lib/dataQuality.js";
import { todayInTimeZone, type IsoDate } from "../lib/dates.js";
import { AppError, fromGoogleError } from "../lib/errors.js";
import {
  computeScribeMetrics,
  metricsFor,
  productionSeries,
  type ProductionSeries,
  type ScribeMetrics,
} from "../metrics/scribe/computeScribeMetrics.js";
import { readScribeTracker } from "../sources/scribeTracker/index.js";

export const SCRIBE_METRIC_DEFINITIONS = {
  notesProduced: "Sum of TOTAL (consult + progress notes) on Daily Production rows, by work date.",
  hoursWorked: "Sum of stored TOTAL HOURS for all sessions, including upload-only sessions.",
  notesPerHour: "notesProduced ÷ hoursWorked for the period (aggregate ratio, not an average of row AVERAGE values).",
  notesUploaded:
    "Sum of UPLOADED NOTES by work date. Upload activity, reported separately from production: uploads can be for notes produced on earlier dates.",
  facilitiesWorked: "Distinct facilities on single-facility entries. Entries naming several facilities are not attributed to any facility.",
  multiFacilityEntries: "Entries naming several facilities. Their notes count toward production but stay unallocated to a facility.",
  extraNotes: "EXTRA NOTES is free text and is excluded from all calculations (V1).",
} as const;

export interface ScribeDashboardEntry extends ScribeMetrics {
  /** Row-level warnings (not info) for this scribe. */
  warningCount: number;
  production: ProductionSeries;
}

export interface ScribeDashboard {
  meta: {
    generatedAt: string;
    asOfDate: IsoDate;
    timezone: string;
    source: { label: string; spreadsheetTitle: string; fetchedAt: string };
    /** What this endpoint covers, so the UI never implies more history than exists. */
    scope: {
      sourceTab: string | null;
      historyStartsOn: IsoDate | null;
      dataThrough: IsoDate | null;
      note: string;
    };
    hoursBasis: "stored-total-hours";
    definitions: typeof SCRIBE_METRIC_DEFINITIONS;
  };
  totals: ScribeMetrics;
  production: ProductionSeries;
  scribes: ScribeDashboardEntry[];
  dataQuality: {
    summary: Record<string, number>;
    structuralIssues: DataQualityIssue[];
    rowIssues: DataQualityIssue[];
    /** Normalized EXTRA NOTES patterns (never raw text). For analysis only; not counted anywhere. */
    extraNotesPatterns: { pattern: string; rows: number }[];
    /** Rows whose DATE/SCRIBE were inherited from the preceding row (continuation lines). */
    inheritedRows: number;
  };
}

export const SCOPE_NOTE =
  "V1 reads only the Daily Production tab. Per-scribe history tabs and former scribes who appear only there are not included.";

export function buildScribeDashboard(
  snapshot: SpreadsheetSnapshot,
  config: ScribeTrackerConfig,
  opts: { today: IsoDate; timezone: string; sourceLabel: string; now?: Date },
): ScribeDashboard {
  const data = readScribeTracker(snapshot, config, opts.today);
  const rowIssues = data.issues.filter((i) => i.scope === "row");
  const dates = data.rows.map((r) => r.workDate).sort();
  const patterns = new Map<string, number>();
  for (const r of data.rows) if (r.extraNotesPattern) patterns.set(r.extraNotesPattern, (patterns.get(r.extraNotesPattern) ?? 0) + 1);

  return {
    meta: {
      generatedAt: (opts.now ?? new Date()).toISOString(),
      asOfDate: opts.today,
      timezone: opts.timezone,
      source: { label: opts.sourceLabel, spreadsheetTitle: snapshot.title, fetchedAt: snapshot.fetchedAt },
      scope: {
        sourceTab: data.sourceTab?.title ?? null,
        historyStartsOn: config.historyStartsOn ?? dates[0] ?? null,
        dataThrough: dates.at(-1) ?? null,
        note: SCOPE_NOTE,
      },
      hoursBasis: "stored-total-hours",
      definitions: SCRIBE_METRIC_DEFINITIONS,
    },
    totals: metricsFor("All scribes", data.rows),
    production: productionSeries(data.rows),
    scribes: computeScribeMetrics(data.rows).map((m) => {
      const rows = data.rows.filter((r) => r.scribe === m.name);
      return {
        ...m,
        warningCount: rowIssues.filter((i) => i.scribe === m.name && i.severity !== "info").length,
        production: productionSeries(rows),
      };
    }),
    dataQuality: {
      summary: summarizeIssues(data.issues),
      structuralIssues: data.issues.filter((i) => i.scope === "structure"),
      rowIssues,
      extraNotesPatterns: [...patterns].map(([pattern, rows]) => ({ pattern, rows })).sort((a, b) => b.rows - a.rows),
      inheritedRows: data.rows.filter((r) => r.inheritedAttribution).length,
    },
  };
}

export interface ScribeDashboardServiceDeps {
  reader: SheetsReader;
  source: SheetSource | undefined;
  config: ScribeTrackerConfig;
  timezone: string;
  cacheTtlMs: number;
  now?: () => Date;
}

export class ScribeDashboardService {
  private readonly cache: TtlCache<ScribeDashboard>;
  private readonly now: () => Date;

  constructor(private readonly deps: ScribeDashboardServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.cache = new TtlCache(deps.cacheTtlMs, () => this.now().getTime());
  }

  async getDashboard(opts: { refresh?: boolean } = {}): Promise<{ data: ScribeDashboard; cached: boolean }> {
    const source = this.deps.source;
    if (!source) throw new AppError(503, "SOURCE_NOT_CONFIGURED", "SCRIBE_TRACKER_SPREADSHEET_ID is not configured.");
    const result = await this.cache.get(async () => {
      let snapshot: SpreadsheetSnapshot;
      try {
        snapshot = await this.deps.reader.readSpreadsheet(source.spreadsheetId);
      } catch (err) {
        throw err instanceof AppError ? err : fromGoogleError(err, source.label);
      }
      const now = this.now();
      return buildScribeDashboard(snapshot, this.deps.config, {
        today: todayInTimeZone(this.deps.timezone, now),
        timezone: this.deps.timezone,
        sourceLabel: source.label,
        now,
      });
    }, opts);
    return { data: result.data, cached: result.cached };
  }
}
