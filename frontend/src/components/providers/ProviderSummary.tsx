import { MetricStrip } from "@/components/ui";
import { formatCount, formatPercent } from "@/lib/format";
import type { ProviderDashboard } from "@/lib/types";

/**
 * The four headline numbers. There is deliberately no overall completion percentage:
 * status coverage is shown instead, because part of the workload has unknown status.
 */
export function ProviderSummary({ data }: { data: ProviderDashboard }) {
  const sum = (k: "completedNotes" | "outstandingNotes") => data.providers.reduce((a, p) => a + p[k], 0);
  const cov = data.meta.statusCoverage;
  return (
    <MetricStrip
      items={[
        { label: "Expected notes", value: formatCount(cov.expectedNotes) },
        { label: "Completed notes", value: formatCount(sum("completedNotes")) },
        { label: "Outstanding notes", value: formatCount(sum("outstandingNotes")) },
        {
          label: "Status coverage",
          value: formatPercent(cov.classifiedPercent),
          note: cov.unknownStatusNotes > 0 ? `${formatCount(cov.unknownStatusNotes)} notes have unknown status` : "All notes have a known status",
        },
      ]}
    />
  );
}
