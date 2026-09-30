import { formatDateRange } from "@/lib/format";
import type { ScribeDashboard } from "@/lib/scribeTypes";

/** States exactly what the scribe data covers, so no one assumes earlier history exists. */
export function ScopeLine({ meta }: { meta: ScribeDashboard["meta"] }) {
  const { historyStartsOn, dataThrough } = meta.scope;
  return (
    <p className="scope-line">
      Reporting period {historyStartsOn && dataThrough ? formatDateRange(historyStartsOn, dataThrough) : "—"} · Source: Daily Production tab. Earlier
      history and former scribes are not included yet.
    </p>
  );
}
