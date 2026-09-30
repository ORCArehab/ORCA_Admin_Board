"use client";

import { useState } from "react";
import { DataTable, type Column } from "@/components/DataTable";
import { formatCount, formatDecimal } from "@/lib/format";
import { periodLabel, type Granularity } from "@/lib/periods";
import type { PeriodProduction, ProductionSeries } from "@/lib/scribeTypes";

const LABELS: Record<Granularity, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

/** Production by work date as a plain table (no charts), with a Daily / Weekly / Monthly switch. */
export function ProductionTable({
  series,
  scope,
  initial = "weekly",
  options = ["daily", "weekly", "monthly"],
}: {
  series: ProductionSeries;
  scope: { from: string | null; to: string | null };
  initial?: Granularity;
  options?: Granularity[];
}) {
  const [granularity, setGranularity] = useState<Granularity>(initial);
  const rows = [...series[granularity]].reverse(); // most recent first
  const columns: Column<PeriodProduction>[] = [
    {
      key: "period",
      header: granularity === "daily" ? "Day" : granularity === "weekly" ? "Week" : "Month",
      render: (p) => {
        const { label, partial } = periodLabel(p.period, granularity, scope);
        return (
          <>
            {label}
            {partial && <span className="muted"> · partial</span>}
          </>
        );
      },
    },
    { key: "notes", header: "Notes produced", align: "right", render: (p) => formatCount(p.notesProduced) },
    { key: "consults", header: "Consults", align: "right", render: (p) => formatCount(p.consults) },
    { key: "followUps", header: "Follow-ups", align: "right", render: (p) => formatCount(p.followUps) },
    { key: "hours", header: "Hours", align: "right", render: (p) => formatDecimal(p.hoursWorked) },
    { key: "rate", header: "Notes / hour", align: "right", render: (p) => formatDecimal(p.notesPerHour) },
    { key: "uploaded", header: "Uploaded", align: "right", render: (p) => formatCount(p.notesUploaded) },
  ];
  return (
    <div>
      <div className="table-toolbar">
        <div className="segmented" role="group" aria-label="Period">
          {options.map((g) => (
            <button key={g} type="button" className="segment" aria-pressed={g === granularity} onClick={() => setGranularity(g)}>
              {LABELS[g]}
            </button>
          ))}
        </div>
        <span className="table-count">By work date, most recent first</span>
      </div>
      <DataTable caption={`${LABELS[granularity]} production`} columns={columns} rows={rows} rowKey={(p) => p.period} emptyMessage="No production in this period." />
    </div>
  );
}
