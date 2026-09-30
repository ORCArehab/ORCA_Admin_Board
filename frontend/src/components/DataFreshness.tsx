import { formatDateTime } from "@/lib/format";

/** "Source read …" plus a refresh button that re-reads the spreadsheet (bypasses the backend cache). */
export function DataFreshness({ fetchedAt, timezone, refreshing, onRefresh }: { fetchedAt: string; timezone: string; refreshing: boolean; onRefresh: () => void }) {
  return (
    <>
      <span>Tracker read {formatDateTime(fetchedAt, timezone)}</span>
      <button className="button" type="button" onClick={onRefresh} disabled={refreshing}>
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </>
  );
}
