import type { ProviderRow } from "../../sources/providerTracker/index.js";

/**
 * How note completion is determined. This is the ONLY place that interprets
 * UPLOADED NOTES for metrics.
 *
 * V1: UPLOADED NOTES is a row/batch-level checkbox. When it is checked, every note
 * counted in the row's TOTAL is considered uploaded; when unchecked, all are outstanding.
 * If ORCA clarifies a different workflow (e.g. per-note status), change this module
 * and COMPLETION_BASIS; metric aggregation does not need to change.
 */
export const COMPLETION_BASIS = "row-level-upload-flag" as const;

/** "unknown" when the status cell is blank or unrecognized (flagged as a data-quality issue). */
export type RowCompletion = "completed" | "outstanding" | "unknown";

export function rowCompletion(row: ProviderRow): RowCompletion {
  switch (row.uploadedNotes) {
    case "checked":
      return "completed";
    case "unchecked":
      return "outstanding";
    default:
      return "unknown";
  }
}
