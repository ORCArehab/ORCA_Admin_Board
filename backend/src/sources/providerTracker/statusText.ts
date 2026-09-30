/**
 * Provider-tracker status-text helpers. The privacy sanitizer itself lives in lib/privacy.ts
 * and is re-exported here for existing imports.
 */
export { normalizeFreeText, safeCellValue } from "../../lib/privacy.js";

export interface StatusTextPatternCount {
  column: "uploadedNotes" | "billingSheet" | "faceSheet";
  pattern: string;
  rows: number;
  /** SUM(TOTAL) of those rows. */
  notes: number;
}

/** Aggregate normalized free-text patterns across rows, most notes first. */
export function summarizeStatusTextPatterns(
  rows: { total: number | null; statusTextPatterns?: Partial<Record<StatusTextPatternCount["column"], string>> }[],
): StatusTextPatternCount[] {
  const counts = new Map<string, StatusTextPatternCount>();
  for (const row of rows) {
    for (const [column, pattern] of Object.entries(row.statusTextPatterns ?? {}) as [StatusTextPatternCount["column"], string][]) {
      const key = `${column}\u0000${pattern}`;
      const entry = counts.get(key) ?? { column, pattern, rows: 0, notes: 0 };
      entry.rows++;
      entry.notes += row.total ?? 0;
      counts.set(key, entry);
    }
  }
  return [...counts.values()].sort((a, b) => a.column.localeCompare(b.column) || b.notes - a.notes || b.rows - a.rows);
}
