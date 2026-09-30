import { formatDate } from "./format";

export type Granularity = "daily" | "weekly" | "monthly";

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const monthDay = (iso: string) => formatDate(iso).replace(/, \d{4}$/, "");
const lastDayOfMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
};

/**
 * Human label for a production period, clipped to the reporting scope so a week or month
 * that starts before the data (or ends after it) is shown as partial rather than implying
 * data exists outside the scope.
 */
export function periodLabel(period: string, granularity: Granularity, scope: { from: string | null; to: string | null }): { label: string; partial: boolean } {
  if (granularity === "daily") {
    const d = new Date(`${period}T00:00:00Z`);
    return { label: `${d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}, ${monthDay(period)}`, partial: false };
  }
  const start = granularity === "weekly" ? period : `${period}-01`;
  const end = granularity === "weekly" ? addDays(period, 6) : lastDayOfMonth(period);
  const from = scope.from && scope.from > start ? scope.from : start;
  const to = scope.to && scope.to < end ? scope.to : end;
  const partial = from !== start || to !== end;
  if (granularity === "monthly" && !partial) {
    return { label: new Date(`${start}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }), partial };
  }
  return { label: from === to ? monthDay(from) : `${monthDay(from)} – ${monthDay(to)}`, partial };
}
