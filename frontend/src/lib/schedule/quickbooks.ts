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
  /** The employee portal: whether providers can see this week yet, and how many board changes a send would show them. */
  portal?: { published: boolean; changes: number };
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
  /** How many entries providers now see for the week in the portal. */
  publishedToPortal?: number;
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

/** What providers see for a week in the employee portal, compared with the board. */
export interface PublicationStatus {
  weekStart: string;
  publishedAt: string | null;
  publishedBy: string | null;
  unsentChanges: number;
}

export async function fetchPublication(weekStart: string): Promise<PublicationStatus | null> {
  try {
    const res = await fetch(`/api/schedule/publication?weekStart=${weekStart}`, { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
    return res.ok ? ((await res.json()) as PublicationStatus) : null;
  } catch {
    return null;
  }
}

/** One line for under the board: whether providers can see this week, and whether it's current. `when` is the formatted send time. */
export function publicationLine(status: PublicationStatus, when: string | null, entries: number): { text: string; attention: boolean } {
  if (!status.publishedAt) {
    return entries === 0
      ? { text: "Nothing on this week yet.", attention: false }
      : { text: "Not sent yet: providers can't see this week in the portal until you send it to QuickBooks Time.", attention: true };
  }
  if (status.unsentChanges === 0) return { text: `Providers see this week as shown (sent ${when}).`, attention: false };
  return {
    text: `${status.unsentChanges} ${status.unsentChanges === 1 ? "change" : "changes"} since the last send (${when}) ${status.unsentChanges === 1 ? "isn't" : "aren't"} visible to providers yet. Send to QuickBooks Time to publish.`,
    attention: true,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What pressing Send will do, as short lines for the dialog. Empty when there's nothing to send. */
export function previewLines(s: QuickBooksPreview["summary"]): string[] {
  return [
    s.create > 0 && `${plural(s.create, "new event")} will be added as ${s.create === 1 ? "a draft" : "drafts"}`,
    s.update > 0 && `${plural(s.update, "event")} will be updated`,
    s.remove > 0 && `${plural(s.remove, "event")} will be removed (${s.remove === 1 ? "its entry is" : "their entries are"} no longer on the schedule)`,
  ].filter((line): line is string => !!line);
}

/** What a send changes for providers in the portal, or null when they already see the week as it is. */
export function portalLine(portal: QuickBooksPreview["portal"]): string | null {
  if (!portal || portal.changes === 0) return null;
  return portal.published
    ? `Providers will see ${plural(portal.changes, "schedule change")} in the portal`
    : "Providers will see this week in the portal for the first time";
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
  const qbt = parts.length ? `Sent to QuickBooks Time: ${parts.join(", ")}.` : "QuickBooks Time already matched this week.";
  return r.publishedToPortal === undefined ? qbt : `${qbt} Providers now see this week in the portal as it is on the board.`;
}
