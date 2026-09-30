const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Placeholder for values that don't exist (never shown as 0). */
export const EMPTY = "—";

export function formatCount(n: number): string {
  return integer.format(n);
}

export function formatPercent(p: number | null): string {
  if (p === null) return EMPTY;
  return `${Number.isInteger(p) ? p : p.toFixed(1)}%`;
}

export function formatDays(d: number | null): string {
  if (d === null) return EMPTY;
  return d === 1 ? "1 day" : `${formatCount(d)} days`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function formatDateTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone });
}

export function providerHref(name: string): string {
  return `/providers/${encodeURIComponent(name)}`;
}
