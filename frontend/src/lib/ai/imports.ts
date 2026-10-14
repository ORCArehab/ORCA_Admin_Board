/** Schedule imports from workbooks and pictures (ORCA_Backend_API src/scheduleImport): types, labels and the browser client. */

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
/** What can be uploaded: an .xlsx workbook, or a picture of a schedule (read by the vision model). */
export const UPLOAD_NAME = /\.(xlsx|png|jpe?g|webp)$/i;
export const UPLOAD_ACCEPT = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";
export const isPicture = (name: string) => /\.(png|jpe?g|webp)$/i.test(name);

/** Why a file can't be uploaded, or null. */
export function uploadProblem(file: { name: string; size: number }): string | null {
  if (/\.(heic|heif)$/i.test(file.name)) return `"${file.name}" is an iPhone HEIC photo, which can't be read. Take a screenshot of it, or export it as JPEG, and upload that.`;
  if (!UPLOAD_NAME.test(file.name)) return `"${file.name}" isn't an .xlsx workbook or a PNG, JPEG or WebP picture.`;
  if (file.size > MAX_UPLOAD_BYTES) return `"${file.name}" is larger than 4 MB.`;
  return null;
}

export type RowStatus = "ready" | "warning" | "conflict" | "duplicate" | "needs_review" | "skipped" | "applied";
export type MatchStatus = "matched" | "suggested" | "ambiguous" | "unknown" | "manual";

export interface ImportRow {
  id: string;
  seq: number;
  sheet: string;
  cellRef: string;
  sourceText: string;
  providerLabel: string | null;
  facilityLabel: string | null;
  date: string | null;
  type: string | null;
  timeBlock: string | null;
  startTime: string | null;
  endTime: string | null;
  coveringLabel: string | null;
  notes: string | null;
  staff: { id: string | null; name: string | null; match: MatchStatus; candidates: Candidate[] };
  facility: { id: string | null; name: string | null; match: MatchStatus; candidates: Candidate[] };
  status: RowStatus;
  issues: RowIssue[];
  existing: { id: string; label: string }[];
  excluded: boolean;
  accepted: boolean;
  appliedEntryId: string | null;
}

/** The other assignment a conflict or warning is about: another row in this file, or an entry already on the schedule. */
export interface IssueOther {
  source: "workbook" | "schedule";
  rowId?: string;
  entryId?: string;
  sheet?: string;
  cellRef?: string;
  sourceText?: string;
  /** From the same cell as this row. */
  sameCell?: boolean;
  provider: string | null;
  facility: string | null;
  type: string;
  date: string;
  time: string;
  label: string;
}

/** Why a row has its status. "related": another row in this file conflicts with this one. */
export interface RowIssue {
  kind: string;
  message: string;
  code?: string;
  other?: IssueOther;
}

/** The assignments read from one cell, in the order they were written. */
export interface CellGroup {
  key: string;
  sheet: string;
  cellRef: string;
  date: string | null;
  sourceText: string;
  rows: ImportRow[];
}

export function groupByCell(rows: ImportRow[]): CellGroup[] {
  const groups = new Map<string, CellGroup>();
  for (const r of rows) {
    const key = `${r.sheet}!${r.cellRef}`;
    const g = groups.get(key) ?? { key, sheet: r.sheet, cellRef: r.cellRef, date: r.date, sourceText: r.sourceText, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }
  return [...groups.values()];
}

const SPANS: Record<string, [number, number]> = { am: [8 * 60, 12 * 60], pm: [13 * 60, 17 * 60], all_day: [8 * 60, 17 * 60] };
const hm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * Consecutive times for places written in one cell under one block ("KW & BV (AM)"): the block
 * divided evenly, in the order written, to the quarter hour. Only offered to the admin; never applied on its own.
 */
export function splitBlock(block: string, count: number): { start: string; end: string }[] | null {
  const span = SPANS[block];
  if (!span || count < 2) return null;
  const step = Math.floor((span[1] - span[0]) / count / 15) * 15;
  if (step < 15) return null;
  return Array.from({ length: count }, (_, i) => ({ start: hm(span[0] + i * step), end: hm(i === count - 1 ? span[1] : span[0] + (i + 1) * step) }));
}

/** A possible match; `best` marks the import's best guess, with why. */
export interface Candidate {
  id: string;
  name: string;
  best?: boolean;
  reason?: string;
}

/** A name in the file not matched yet, with the best guess (if there's a reasonable one) to confirm. */
export interface Unmatched {
  label: string;
  rows: number;
  status: MatchStatus;
  suggestion?: { id: string; name: string; reason: string | null } | null;
}

export interface ImportSummary {
  id: string;
  fileName: string;
  /** "image": transcribed from a picture by the vision model. */
  source?: "workbook" | "image";
  status: "draft" | "applied" | "discarded";
  createdBy: string;
  createdAt: string;
  appliedAt: string | null;
  sheets: { name: string; layout: string | null; items: number; reason: string | null }[];
  counts: Record<RowStatus | "excluded" | "total", number>;
  dateRange: { from: string | null; to: string | null };
  unmatchedProviders: Unmatched[];
  unmatchedFacilities: Unmatched[];
  /** Best guesses waiting for the admin to confirm. */
  suggestions?: number;
}

export interface ImportDraft {
  summary: ImportSummary;
  rows: ImportRow[];
}

export const STATUS_LABELS: Record<RowStatus | "excluded", string> = {
  ready: "Ready",
  warning: "Warning",
  conflict: "Conflict",
  duplicate: "Already scheduled",
  needs_review: "Needs review",
  skipped: "Skipped",
  applied: "Added",
  excluded: "Excluded",
};

export const LAYOUT_LABELS: Record<string, string> = {
  tabular: "Table (one assignment per row)",
  "person-grid": "Calendar grid: providers down the side",
  "facility-grid": "Calendar grid: facilities down the side",
  "date-rows": "Calendar grid: dates down the side",
};

const BLOCKS: Record<string, string> = { am: "AM", pm: "PM", all_day: "All day" };
const TYPES: Record<string, string> = { facility: "Facility", coverage: "Coverage", admin: "Admin", clinic: "Clinic", pto: "PTO", off: "Off" };

/** "AM", "All day", "9:00–11:00". */
export const timeLabel = (r: Pick<ImportRow, "timeBlock" | "startTime" | "endTime">) =>
  r.timeBlock === "custom" && r.startTime && r.endTime ? `${r.startTime}–${r.endTime}` : (BLOCKS[r.timeBlock ?? ""] ?? r.timeBlock ?? "");
export const typeLabel = (type: string | null) => (type ? (TYPES[type] ?? type) : "—");

/** The row's effective state for filtering and counting: excluded wins unless it was applied. */
export const effectiveStatus = (r: Pick<ImportRow, "status" | "excluded">): RowStatus | "excluded" => (r.excluded && r.status !== "applied" ? "excluded" : r.status);

/** How many rows Apply would add now, with and without confirming warnings. */
export function applicable(rows: ImportRow[]): { ready: number; warning: number } {
  let ready = 0;
  let warning = 0;
  for (const r of rows) {
    if (r.excluded) continue;
    if (r.status === "ready") ready++;
    if (r.status === "warning") warning++;
  }
  return { ready, warning };
}

/** One line about the draft, for chat and the review header. */
export function summaryLine(counts: ImportSummary["counts"]): string {
  const parts = [
    counts.ready && `${counts.ready} ready`,
    counts.warning && `${counts.warning} with warnings`,
    counts.needs_review && `${counts.needs_review} need review`,
    counts.conflict && `${counts.conflict} conflict${counts.conflict === 1 ? "" : "s"}`,
    counts.duplicate && `${counts.duplicate} already scheduled`,
    counts.skipped && `${counts.skipped} skipped`,
    counts.applied && `${counts.applied} added`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No assignments found";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store", headers: { accept: "application/json", ...(init.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}) } });
  } catch {
    throw new Error("ORCA Admin couldn't be reached. Check your connection.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Request failed (${res.status}).`);
  }
  return (await res.json()) as T;
}

export function uploadSchedule(file: File): Promise<ImportDraft> {
  const form = new FormData();
  form.set("file", file, file.name);
  return request<ImportDraft>("/api/schedule-imports", { method: "POST", body: form });
}
export const getImport = (id: string) => request<ImportDraft>(`/api/schedule-imports/${encodeURIComponent(id)}`);
export type RowTime = { block: "am" | "pm" | "all_day" } | { block: "custom"; start: string; end: string };
export const updateImportRow = (id: string, rowId: string, change: { staffId?: string | null; facilityId?: string | null; excluded?: boolean; accepted?: boolean; sameLabel?: boolean; time?: RowTime }) =>
  request<ImportDraft>(`/api/schedule-imports/${encodeURIComponent(id)}/rows/${encodeURIComponent(rowId)}`, { method: "PATCH", body: JSON.stringify(change) });
export const applyImport = (id: string, confirmWarnings: boolean) =>
  request<{ result: { applied: number; failed: { rowId: string; cellRef: string; sheet: string; message: string }[]; remaining: number }; draft: ImportDraft }>(`/api/schedule-imports/${encodeURIComponent(id)}/apply`, {
    method: "POST",
    body: JSON.stringify({ confirmWarnings }),
  });
/** Confirms best guesses: every one, or just these labels. */
export const confirmSuggestions = (id: string, labels?: { kind: "provider" | "facility"; label: string }[]) =>
  request<ImportDraft>(`/api/schedule-imports/${encodeURIComponent(id)}/confirm-suggestions`, { method: "POST", body: JSON.stringify(labels ? { labels } : {}) });
export const discardImport = (id: string) => request<{ discarded: boolean }>(`/api/schedule-imports/${encodeURIComponent(id)}/discard`, { method: "POST", body: "{}" });
