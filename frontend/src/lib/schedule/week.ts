/**
 * Calendar weeks for the schedule: Monday to Sunday, as YYYY-MM-DD strings. Date arithmetic is
 * done in UTC on plain dates, so it never shifts with the viewer's timezone or daylight saving.
 */

export const SCHEDULE_TIMEZONE = "America/Los_Angeles";

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toDate(value).getTime()) && toIso(toDate(value)) === value;
}

export function addDays(iso: string, days: number): string {
  const date = toDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

/** The Monday on or before a date. */
export function weekStart(iso: string): string {
  const day = toDate(iso).getUTCDay(); // 0 = Sunday
  return addDays(iso, day === 0 ? -6 : 1 - day);
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Today's date where ORCA operates, whatever the viewer's own timezone. */
export function today(now: Date = new Date(), timeZone = SCHEDULE_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const fmt = (iso: string, options: Intl.DateTimeFormatOptions) => toDate(iso).toLocaleDateString("en-US", { timeZone: "UTC", ...options });

/** "Oct 12 – 18, 2026", "Sep 28 – Oct 4, 2026", "Dec 28, 2026 – Jan 3, 2027". */
export function weekLabel(start: string): string {
  const end = addDays(start, 6);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const sameMonth = sameYear && start.slice(5, 7) === end.slice(5, 7);
  if (sameMonth) return `${fmt(start, { month: "short", day: "numeric" })} – ${fmt(end, { day: "numeric" })}, ${end.slice(0, 4)}`;
  if (sameYear) return `${fmt(start, { month: "short", day: "numeric" })} – ${fmt(end, { month: "short", day: "numeric" })}, ${end.slice(0, 4)}`;
  return `${fmt(start, { month: "short", day: "numeric", year: "numeric" })} – ${fmt(end, { month: "short", day: "numeric", year: "numeric" })}`;
}

/** Column heading parts: { weekday: "Mon", day: "Oct 12" }. */
export function dayHeading(iso: string): { weekday: string; day: string } {
  return { weekday: fmt(iso, { weekday: "short" }), day: fmt(iso, { month: "short", day: "numeric" }) };
}
