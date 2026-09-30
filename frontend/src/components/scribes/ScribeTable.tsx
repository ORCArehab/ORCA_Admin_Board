"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/DataTable";
import { formatCount, formatDecimal, scribeHref } from "@/lib/format";
import type { ScribeDashboard, ScribeEntry } from "@/lib/scribeTypes";

/** Scribes in alphabetical order: descriptive, not a ranking. */
export function ScribeTable({ data }: { data: ScribeDashboard }) {
  const defs = data.meta.definitions;
  const columns: Column<ScribeEntry>[] = [
    {
      key: "name",
      header: "Scribe",
      render: (s) => (
        <span className="completion">
          <Link className="table-link" href={scribeHref(s.name)}>
            {s.name}
          </Link>
          {s.warningCount > 0 && <span className="coverage-flag" title="Some source data needs review" aria-label="Some source data needs review" />}
        </span>
      ),
    },
    { key: "notes", header: "Notes produced", align: "right", description: defs.notesProduced, render: (s) => formatCount(s.notesProduced) },
    { key: "consults", header: "Consults", align: "right", render: (s) => formatCount(s.consults) },
    { key: "followUps", header: "Follow-ups", align: "right", render: (s) => formatCount(s.followUps) },
    { key: "hours", header: "Hours", align: "right", description: defs.hoursWorked, render: (s) => formatDecimal(s.hoursWorked) },
    { key: "rate", header: "Notes / hour", align: "right", description: defs.notesPerHour, render: (s) => formatDecimal(s.notesPerHour) },
    { key: "uploaded", header: "Uploaded", align: "right", description: defs.notesUploaded, render: (s) => formatCount(s.notesUploaded) },
    { key: "days", header: "Work days", align: "right", render: (s) => formatCount(s.workDays) },
    { key: "facilities", header: "Facilities", align: "right", description: defs.facilitiesWorked, render: (s) => formatCount(s.facilitiesWorked) },
  ];
  return <DataTable caption="Scribe production" columns={columns} rows={data.scribes} rowKey={(s) => s.name} rowHref={(s) => scribeHref(s.name)} emptyMessage="No scribe rows in the reporting period." />;
}
