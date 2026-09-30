/**
 * Response contract of GET /api/dashboard/scribes (backend/src/services/scribeDashboard.ts).
 * Descriptive production data only: no completion, outstanding, ranking or score fields exist.
 */

export interface ProductionTotals {
  notesProduced: number;
  consults: number;
  followUps: number;
  hoursWorked: number;
  /** notesProduced / hoursWorked; null when no hours. */
  notesPerHour: number | null;
  /** Upload activity: separate from production (uploads can be for earlier work). */
  notesUploaded: number;
}

export interface PeriodProduction extends ProductionTotals {
  /** Day YYYY-MM-DD, week = Monday YYYY-MM-DD, month YYYY-MM. */
  period: string;
}

export interface ProductionSeries {
  daily: PeriodProduction[];
  weekly: PeriodProduction[];
  monthly: PeriodProduction[];
}

export interface ScribeMetrics extends ProductionTotals {
  name: string;
  sessions: number;
  workDays: number;
  facilitiesWorked: number;
  multiFacilityEntries: number;
  unallocatedFacilityNotes: number;
  firstWorkDate: string | null;
  lastWorkDate: string | null;
}

export interface ScribeEntry extends ScribeMetrics {
  warningCount: number;
  production: ProductionSeries;
}

export interface ScribeDashboard {
  meta: {
    generatedAt: string;
    asOfDate: string;
    timezone: string;
    cached: boolean;
    source: { label: string; spreadsheetTitle: string; fetchedAt: string };
    scope: { sourceTab: string | null; historyStartsOn: string | null; dataThrough: string | null; note: string };
    hoursBasis: string;
    definitions: Record<"notesProduced" | "hoursWorked" | "notesPerHour" | "notesUploaded" | "facilitiesWorked" | "multiFacilityEntries" | "extraNotes", string>;
  };
  totals: ScribeMetrics;
  production: ProductionSeries;
  scribes: ScribeEntry[];
}
