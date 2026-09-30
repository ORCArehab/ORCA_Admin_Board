/**
 * Response contract of GET /api/dashboard/providers (backend/src/services/providerDashboard.ts).
 * Only the fields the UI uses are typed; diagnostics are intentionally left out of the admin UI.
 */

export interface ProviderEntry {
  name: string;
  /** "incomplete" when some of this provider's source data could not be read. */
  dataStatus: "ok" | "incomplete";
  /** Rows flagged for source-data review. */
  warningCount: number;
  tabs: string[];

  expectedNotes: number;
  completedNotes: number;
  outstandingNotes: number;
  /** Notes whose upload status is blank or free text — neither completed nor outstanding. */
  unknownStatusNotes: number;
  /** completed + outstanding. */
  classifiedNotes: number;
  /** completed / classified × 100; null when nothing has a known status. */
  completionRate: number | null;
  /** classified / expected × 100; null when nothing is expected. */
  statusCoveragePercent: number | null;

  outstandingBatches: number;
  oldestOutstandingDays: number | null;
  oldestOutstandingVisitDate: string | null;
  consults: number;
  followUps: number;
  billingSheetBacklog: number;
  facesheetBacklog: number;
}

export interface ProviderDashboard {
  meta: {
    generatedAt: string;
    asOfDate: string;
    timezone: string;
    cached: boolean;
    completionBasis: string;
    definitions: {
      completionRate: string;
      statusCoveragePercent: string;
      classifiedNotes: string;
      unknownStatusNotes: string;
      outstandingBatches: string;
    };
    statusCoverage: {
      expectedNotes: number;
      classifiedNotes: number;
      unknownStatusNotes: number;
      classifiedPercent: number | null;
      providersWithUnknownStatus: string[];
    };
    source: { label: string; spreadsheetTitle: string; fetchedAt: string };
  };
  providers: ProviderEntry[];
}
