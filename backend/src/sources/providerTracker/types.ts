import type { IsoDate } from "../../lib/dates.js";

/** Fields we read from provider tabs. REMARKS is intentionally not read (may contain PHI). */
export type ProviderField =
  | "visitDate"
  | "facilities"
  | "billingSheet"
  | "consultNotes"
  | "progressNotes"
  | "total"
  | "uploadedNotes"
  | "faceSheet";

/** Columns a tab must have to be treated as a provider tab. */
export const REQUIRED_PROVIDER_FIELDS: readonly ProviderField[] = ["visitDate", "total", "uploadedNotes"];

/**
 * Interpreted checkbox/status cell.
 *  - checked / unchecked: TRUE / FALSE
 *  - blank: empty cell (no checkbox or no value)
 *  - unrecognized: some other value; flagged as UNEXPECTED_STATUS
 */
export type CheckState = "checked" | "unchecked" | "blank" | "unrecognized";

/** One typed row from a provider tab. `null` means the value was blank or unreadable. */
export interface ProviderRow {
  provider: string;
  tab: string;
  sheetId: number;
  /** 1-based row number in the sheet. */
  row: number;
  visitDate: IsoDate | null;
  facilities: string | null;
  /** FACILITIES names several facilities sharing one TOTAL; never split across facilities. */
  multiFacility: boolean;
  consultNotes: number | null;
  progressNotes: number | null;
  total: number | null;
  uploadedNotes: CheckState;
  /** `null` when the tab has no such column. */
  billingSheet: CheckState | null;
  faceSheet: CheckState | null;
  /** Normalized, privacy-safe pattern of free text found in a status column (see statusText.ts). */
  statusTextPatterns?: Partial<Record<"uploadedNotes" | "billingSheet" | "faceSheet", string>>;
}
