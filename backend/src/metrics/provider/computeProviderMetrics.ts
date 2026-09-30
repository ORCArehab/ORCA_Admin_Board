import { daysBetween, type IsoDate } from "../../lib/dates.js";
import type { ProviderRow } from "../../sources/providerTracker/index.js";
import { isBillingSheetOutstanding, isFacesheetOutstanding } from "./backlogRules.js";
import { rowCompletion } from "./completionModel.js";

export interface ProviderMetrics {
  name: string;
  /** SUM(TOTAL) */
  expectedNotes: number;
  /** SUM(TOTAL) where the row is completed per the completion model. */
  completedNotes: number;
  /** SUM(TOTAL) where TOTAL > 0 and the row is outstanding. */
  outstandingNotes: number;
  /** SUM(TOTAL) for rows whose upload status is blank/unrecognized (neither completed nor outstanding). */
  unknownStatusNotes: number;
  /** completed / expected × 100, one decimal; null when expected = 0. */
  completionRate: number | null;
  /** Number of outstanding rows/batches. */
  outstandingBatches: number;
  /** Days since the oldest outstanding VISIT DATE; null if none (or none readable). */
  oldestOutstandingDays: number | null;
  oldestOutstandingVisitDate: IsoDate | null;
  /** SUM(CONSULT NOTES) */
  consults: number;
  /** SUM(PROGRESS NOTES) */
  followUps: number;
  /** Rows/batches missing a billing sheet. */
  billingSheetBacklog: number;
  /** Rows/batches missing a facesheet (where one is expected). */
  facesheetBacklog: number;
}

function emptyMetrics(name: string): ProviderMetrics {
  return {
    name,
    expectedNotes: 0,
    completedNotes: 0,
    outstandingNotes: 0,
    unknownStatusNotes: 0,
    completionRate: null,
    outstandingBatches: 0,
    oldestOutstandingDays: null,
    oldestOutstandingVisitDate: null,
    consults: 0,
    followUps: 0,
    billingSheetBacklog: 0,
    facesheetBacklog: 0,
  };
}

/** Metrics for one provider's rows. Pure. */
export function computeMetricsForRows(name: string, rows: ProviderRow[], today: IsoDate): ProviderMetrics {
  const m = emptyMetrics(name);

  for (const row of rows) {
    m.consults += row.consultNotes ?? 0;
    m.followUps += row.progressNotes ?? 0;
    if (isBillingSheetOutstanding(row)) m.billingSheetBacklog++;
    if (isFacesheetOutstanding(row)) m.facesheetBacklog++;

    // Rows without a readable TOTAL cannot contribute to note counts (flagged at parse time).
    if (row.total === null) continue;
    m.expectedNotes += row.total;

    const completion = rowCompletion(row);
    if (completion === "completed") {
      m.completedNotes += row.total;
    } else if (completion === "outstanding" && row.total > 0) {
      m.outstandingNotes += row.total;
      m.outstandingBatches++;
      if (row.visitDate && (!m.oldestOutstandingVisitDate || row.visitDate < m.oldestOutstandingVisitDate)) {
        m.oldestOutstandingVisitDate = row.visitDate;
      }
    } else if (completion === "unknown") {
      m.unknownStatusNotes += row.total;
    }
  }

  if (m.expectedNotes > 0) m.completionRate = Math.round((m.completedNotes / m.expectedNotes) * 1000) / 10;
  if (m.oldestOutstandingVisitDate) m.oldestOutstandingDays = Math.max(0, daysBetween(m.oldestOutstandingVisitDate, today));
  return m;
}

/**
 * Metrics for every provider, including providers with no rows (zeros).
 * Sorted by what most needs attention: outstanding notes, then oldest age, then name.
 */
export function computeProviderMetrics(providers: string[], rows: ProviderRow[], today: IsoDate): ProviderMetrics[] {
  const byProvider = new Map<string, ProviderRow[]>(providers.map((p) => [p, []]));
  for (const row of rows) {
    if (!byProvider.has(row.provider)) byProvider.set(row.provider, []);
    byProvider.get(row.provider)!.push(row);
  }
  return [...byProvider.entries()]
    .map(([name, providerRows]) => computeMetricsForRows(name, providerRows, today))
    .sort(
      (a, b) =>
        b.outstandingNotes - a.outstandingNotes ||
        (b.oldestOutstandingDays ?? -1) - (a.oldestOutstandingDays ?? -1) ||
        a.name.localeCompare(b.name),
    );
}
