import { MetricStrip } from "@/components/ui";
import { formatCount, formatDecimal } from "@/lib/format";
import type { ScribeMetrics } from "@/lib/scribeTypes";

/** Four descriptive headline numbers. Production and uploads are shown side by side, never as a ratio. */
export function ScribeSummary({ totals }: { totals: ScribeMetrics }) {
  return (
    <MetricStrip
      items={[
        { label: "Notes produced", value: formatCount(totals.notesProduced), note: `${formatCount(totals.consults)} consults · ${formatCount(totals.followUps)} follow-ups` },
        { label: "Hours worked", value: formatDecimal(totals.hoursWorked), note: `${formatCount(totals.sessions)} sessions` },
        { label: "Notes per hour", value: formatDecimal(totals.notesPerHour), note: "Notes produced ÷ hours worked" },
        { label: "Notes uploaded", value: formatCount(totals.notesUploaded), note: "Upload activity, separate from production" },
      ]}
    />
  );
}
