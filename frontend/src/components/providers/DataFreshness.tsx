import { formatDateTime } from "@/lib/format";
import type { ProviderDashboard } from "@/lib/types";

/** "Updated …" plus a refresh button that re-reads the tracker (bypasses the backend cache). */
export function DataFreshness({ data, refreshing, onRefresh }: { data: ProviderDashboard; refreshing: boolean; onRefresh: () => void }) {
  return (
    <>
      <span>Tracker read {formatDateTime(data.meta.source.fetchedAt, data.meta.timezone)}</span>
      <button className="button" type="button" onClick={onRefresh} disabled={refreshing}>
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </>
  );
}
