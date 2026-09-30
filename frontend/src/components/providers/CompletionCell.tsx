import { hasLimitedCoverage } from "@/lib/attention";
import { formatCount, formatPercent } from "@/lib/format";
import type { ProviderEntry } from "@/lib/types";

/**
 * Completion rate that always carries its coverage context. When status coverage is
 * limited, a caution dot marks the rate and the tooltip explains what it's based on.
 */
export function CompletionCell({ provider }: { provider: ProviderEntry }) {
  if (provider.completionRate === null) {
    return (
      <span className="muted" title={provider.expectedNotes > 0 ? "No notes have a known upload status" : "No expected notes"}>
        —
      </span>
    );
  }
  const limited = hasLimitedCoverage(provider);
  const title = limited
    ? `Based on ${formatCount(provider.classifiedNotes)} of ${formatCount(provider.expectedNotes)} notes with a known status (${formatPercent(provider.statusCoveragePercent)} coverage)`
    : undefined;
  return (
    <span className="completion" title={title}>
      <span className="num">{formatPercent(provider.completionRate)}</span>
      {limited && (
        <>
          <span className="coverage-flag" aria-hidden="true" />
          <span className="sr-only">based on incomplete status coverage</span>
        </>
      )}
    </span>
  );
}

export function CoverageCell({ provider }: { provider: ProviderEntry }) {
  if (provider.statusCoveragePercent === null) return <span className="muted">—</span>;
  return <span className={hasLimitedCoverage(provider) ? "caution-text num" : "num"}>{formatPercent(provider.statusCoveragePercent)}</span>;
}
