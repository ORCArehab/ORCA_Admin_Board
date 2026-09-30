import type { CellValue } from "../../integrations/google/sheets.js";

/**
 * Privacy-safe normalization of free text found in tracker cells.
 *
 * Free text in status columns can contain patient initials or names
 * (e.g. "AB 1/2/26 uploaded"), so it is never returned verbatim. Only words from a
 * fixed workflow vocabulary survive; dates become <date>, numbers <n>, and every other
 * run of words collapses to "…". Example: "AB 1/2/26 uploaded" → "… <date> uploaded".
 *
 * The patterns support deciding explicit normalization rules later; they are NOT used
 * to classify completion (see metrics/provider/completionModel.ts).
 */
const WORKFLOW_VOCABULARY = new Set([
  "uploaded", "upload", "uploading", "pending", "done", "complete", "completed", "incomplete",
  "sent", "missing", "received", "emailed", "waiting", "hold", "partial", "partially",
  "billing", "biller", "facesheet", "face", "sheet", "sheets", "notes", "note",
  "consult", "consults", "progress", "follow", "up", "fu",
  "na", "n/a", "tbd", "yes", "no", "not", "yet", "still", "all", "some", "only", "remaining", "left",
  "for", "to", "in", "on", "of", "and", "the", "from", "with", "without", "by", "see", "remarks",
  "today", "tomorrow", "already", "need", "needs", "needed", "cancelled", "canceled", "rescheduled",
]);

const DATE_TOKEN = /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$|^\d{4}-\d{1,2}-\d{1,2}$/;

export function normalizeFreeText(text: string): string {
  const out: string[] = [];
  for (const raw of text.trim().split(/\s+/)) {
    const tok = raw.toLowerCase().replace(/^[^a-z0-9/]+|[^a-z0-9/]+$/g, "");
    const norm = DATE_TOKEN.test(tok) ? "<date>" : /^\d+$/.test(tok) ? "<n>" : WORKFLOW_VOCABULARY.has(tok) ? tok : "…";
    if (norm === "…" && out.at(-1) === "…") continue;
    out.push(norm);
  }
  return out.join(" ") || "…";
}

/**
 * Value safe to include in API responses, logs and reports. Raw cell contents never pass:
 * strings become a normalized pattern and numbers become "<n>" (a number in the wrong
 * column could be an identifier). Booleans (checkbox states) pass through.
 */
export function safeCellValue(v: CellValue | undefined): string | boolean | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return normalizeFreeText(v);
  if (typeof v === "number") return "<n>";
  return v;
}

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
