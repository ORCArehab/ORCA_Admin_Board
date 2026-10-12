import { ApiError } from "@/lib/api";

/** Browser client for /api/quickbooks-time/*: sending a week of the schedule to QuickBooks Time. */

export interface QuickBooksPreview {
  weekStart: string;
  calendar: { id: number; name: string };
  summary: { create: number; update: number; remove: number; unchanged: number; notSent: number; blocked: number };
  unmatchedStaff: { id: string; name: string; entries: number }[];
  unmatchedFacilities: { id: string; name: string; entries: number }[];
  users: { id: number; name: string; email: string | null }[];
  jobcodes: { id: number; name: string }[];
  lastSent: { at: string; by: string; created: number; updated: number; removed: number; failed: number } | null;
}

export interface QuickBooksSendResult {
  weekStart: string;
  created: number;
  updated: number;
  removed: number;
  unchanged: number;
  blocked: number;
  notSent: number;
  failures: { action: "create" | "update" | "remove"; date: string | null; message: string }[];
}

async function request<T>(path: string, method: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method, credentials: "same-origin", cache: "no-store", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "NETWORK", "ORCA Admin couldn't be reached. Check your connection.");
  }
  if (!res.ok) {
    const failure = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(res.status, failure?.error?.code ?? "HTTP_ERROR", failure?.error?.message ?? `Request failed (${res.status}).`);
  }
  return (await res.json()) as T;
}

/** The address of QuickBooks Time's approval page; the browser goes there to connect. */
export const startQuickBooksConnect = () => request<{ url: string }>("/api/quickbooks-time/connect", "POST", {}).then((r) => r.url);
export const disconnectQuickBooks = () => request<{ connected: boolean }>("/api/quickbooks-time/disconnect", "POST", {});

/** Error codes that mean "connect (again) first". */
export const needsConnection = (code: string) => code === "NOT_CONNECTED" || code === "RECONNECT";

/** What to tell the admin after QuickBooks Time sends them back (?quickbooks=...). */
export function connectOutcome(value: string | null): string | null {
  if (value === "connected") return "QuickBooks Time is connected. Press Send to QuickBooks Time to send this week.";
  if (value === "declined") return "QuickBooks Time wasn't connected: access wasn't approved.";
  if (value === "failed") return "QuickBooks Time couldn't be connected. Try connecting again.";
  return null;
}

export const previewQuickBooks = (weekStart: string) => request<QuickBooksPreview>("/api/quickbooks-time/preview", "POST", { weekStart });
export const sendToQuickBooks = (weekStart: string) => request<QuickBooksSendResult>("/api/quickbooks-time/send", "POST", { weekStart });
export const linkQuickBooks = (kind: "staff" | "facilities", recordId: string, id: number) =>
  request<{ linked: boolean }>(`/api/quickbooks-time/links/${kind}/${encodeURIComponent(recordId)}`, "PUT", { id });

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What pressing Send will do, as short lines for the dialog. Empty when there's nothing to send. */
export function previewLines(s: QuickBooksPreview["summary"]): string[] {
  return [
    s.create > 0 && `${plural(s.create, "new event")} will be added as ${s.create === 1 ? "a draft" : "drafts"}`,
    s.update > 0 && `${plural(s.update, "event")} will be updated`,
    s.remove > 0 && `${plural(s.remove, "event")} will be removed (${s.remove === 1 ? "its entry is" : "their entries are"} no longer on the schedule)`,
  ].filter((line): line is string => !!line);
}

/** What stays as it is, and why. */
export function previewNotes(s: QuickBooksPreview["summary"]): string[] {
  return [
    s.unchanged > 0 && `${plural(s.unchanged, "event")} already up to date`,
    s.blocked > 0 && `${plural(s.blocked, "entry", "entries")} waiting on a match below`,
    s.notSent > 0 && `${plural(s.notSent, "PTO, Off, Admin or Clinic entry", "PTO, Off, Admin or Clinic entries")} not sent (they stay in ORCA)`,
  ].filter((line): line is string => !!line);
}

export function resultLine(r: QuickBooksSendResult): string {
  const parts = [r.created > 0 && `${r.created} added`, r.updated > 0 && `${r.updated} updated`, r.removed > 0 && `${r.removed} removed`].filter(Boolean);
  return parts.length ? `Sent to QuickBooks Time: ${parts.join(", ")}.` : "QuickBooks Time already matched this week. Nothing was changed.";
}
