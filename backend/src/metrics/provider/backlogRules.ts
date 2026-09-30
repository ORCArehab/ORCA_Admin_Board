import type { ProviderRow } from "../../sources/providerTracker/index.js";

/**
 * Billing-sheet and facesheet backlog definitions. Backlogs count rows/batches
 * ("8 batches are missing billing sheets"), not notes.
 * Change the rules here if ORCA's workflow requires; aggregation code is unaffected.
 */
export const BACKLOG_BASIS = {
  billingSheet: "rows-with-notes-and-billing-sheet-unchecked",
  facesheet: "rows-with-notes-and-facesheet-unchecked; blank facesheet cell = not tracked for that row (provisional)",
} as const;

const hasNotes = (row: ProviderRow): boolean => (row.total ?? 0) > 0;

/** TOTAL > 0 and Billing sheet = FALSE. */
export function isBillingSheetOutstanding(row: ProviderRow): boolean {
  return hasNotes(row) && row.billingSheet === "unchecked";
}

/**
 * Whether a facesheet is expected for this row.
 *
 * PROVISIONAL: the real tracker has not yet been inspected to confirm which rows need
 * a facesheet (e.g. consults only). Until then we infer only from structure: a row with
 * a TRUE/FALSE facesheet cell is tracked; a blank cell is treated as "not tracked" rather
 * than missing. Replace this once the rule is confirmed from the sheet.
 */
export function isFacesheetExpected(row: ProviderRow): boolean {
  return row.faceSheet === "checked" || row.faceSheet === "unchecked";
}

export function isFacesheetOutstanding(row: ProviderRow): boolean {
  return hasNotes(row) && isFacesheetExpected(row) && row.faceSheet === "unchecked";
}
