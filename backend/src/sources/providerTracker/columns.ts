import type { CellValue } from "../../integrations/google/sheets.js";
import type { ProviderField } from "./types.js";

/**
 * Header spellings per field. Matching ignores case, spaces and punctuation,
 * so "Face sheet", "FACESHEET" and "Face-Sheet" are equivalent.
 * Additional spellings can be added via config `columnAliases` without code changes.
 */
export const DEFAULT_COLUMN_ALIASES: Record<ProviderField, string[]> = {
  visitDate: ["VISIT DATE", "VISIT DATES", "DATE OF VISIT"],
  facilities: ["FACILITIES", "FACILITY"],
  billingSheet: ["BILLING SHEET", "BILLING SHEETS"],
  consultNotes: ["CONSULT NOTES", "CONSULT", "CONSULTS"],
  progressNotes: ["PROGRESS NOTES", "PROGRESS", "FOLLOW UP", "FOLLOW UPS", "FOLLOW UP NOTES"],
  total: ["TOTAL", "TOTAL NOTES"],
  uploadedNotes: ["UPLOADED NOTES", "UPLOADED", "NOTES UPLOADED"],
  faceSheet: ["FACE SHEET", "FACE SHEETS"],
};

export function normalizeHeader(value: CellValue): string {
  if (value === null || value === undefined) return "";
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export type AliasLookup = Map<string, ProviderField>;

export function buildAliasLookup(extra: Record<string, string[]> = {}): AliasLookup {
  const lookup: AliasLookup = new Map();
  for (const [field, aliases] of Object.entries(DEFAULT_COLUMN_ALIASES) as [ProviderField, string[]][]) {
    for (const alias of [...aliases, ...(extra[field] ?? [])]) lookup.set(normalizeHeader(alias), field);
  }
  return lookup;
}

export interface HeaderMatch {
  /** 0-based index of the header row within the tab's values. */
  rowIndex: number;
  /** Field → 0-based column index (first matching column wins). */
  columns: Partial<Record<ProviderField, number>>;
  /** Header text for each matched field, for diagnostics. */
  headerText: Partial<Record<ProviderField, string>>;
  /** Fields that appeared in more than one column. */
  duplicates: ProviderField[];
}

/** Match a single row against known header aliases. */
export function matchHeaderRow(row: CellValue[], lookup: AliasLookup, rowIndex: number): HeaderMatch {
  const match: HeaderMatch = { rowIndex, columns: {}, headerText: {}, duplicates: [] };
  row.forEach((cell, col) => {
    const field = lookup.get(normalizeHeader(cell));
    if (!field) return;
    if (match.columns[field] === undefined) {
      match.columns[field] = col;
      match.headerText[field] = String(cell).trim();
    } else if (!match.duplicates.includes(field)) {
      match.duplicates.push(field);
    }
  });
  return match;
}

export function matchedFieldCount(match: HeaderMatch): number {
  return Object.keys(match.columns).length;
}

/**
 * Find the header row within the first `scanRows` rows: the row matching the most
 * known fields (at least two, to avoid mistaking a stray "TOTAL" label for a header).
 */
export function findHeaderRow(values: CellValue[][], lookup: AliasLookup, scanRows: number): HeaderMatch | null {
  let best: HeaderMatch | null = null;
  const limit = Math.min(values.length, scanRows);
  for (let i = 0; i < limit; i++) {
    const match = matchHeaderRow(values[i] ?? [], lookup, i);
    const count = matchedFieldCount(match);
    if (count >= 2 && (!best || count > matchedFieldCount(best))) best = match;
  }
  return best;
}
