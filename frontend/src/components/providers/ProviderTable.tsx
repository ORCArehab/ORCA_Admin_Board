"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/DataTable";
import { ATTENTION_CRITERIA } from "@/lib/attention";
import { EMPTY, formatCount, formatDays, providerHref } from "@/lib/format";
import type { ProviderDashboard, ProviderEntry } from "@/lib/types";
import { CompletionCell, CoverageCell } from "./CompletionCell";

/** Provider list in the backend's order (outstanding notes, then oldest outstanding age). */
export function ProviderTable({ data }: { data: ProviderDashboard }) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? data.providers.filter((p) => p.name.toLowerCase().includes(q)) : data.providers;
  }, [data.providers, query]);

  const columns: Column<ProviderEntry>[] = [
    {
      key: "name",
      header: "Provider",
      render: (p) => (
        <span className="completion">
          <Link className="table-link" href={providerHref(p.name)}>
            {p.name}
          </Link>
          {p.dataStatus === "incomplete" && (
            <span className="coverage-flag" title="Some source data needs review" aria-label="Some source data needs review" />
          )}
        </span>
      ),
    },
    { key: "completion", header: "Completion", align: "right", description: data.meta.definitions.completionRate, render: (p) => <CompletionCell provider={p} /> },
    { key: "coverage", header: "Status coverage", align: "right", description: data.meta.definitions.statusCoveragePercent, render: (p) => <CoverageCell provider={p} /> },
    { key: "outstanding", header: "Outstanding", align: "right", render: (p) => formatCount(p.outstandingNotes) },
    { key: "batches", header: "Outstanding batches", align: "right", description: data.meta.definitions.outstandingBatches, render: (p) => formatCount(p.outstandingBatches) },
    {
      key: "oldest",
      header: "Oldest",
      align: "right",
      description: "Age of the oldest outstanding batch (days since visit date)",
      render: (p) => (p.oldestOutstandingDays === null ? <span className="muted">{EMPTY}</span> : formatDays(p.oldestOutstandingDays)),
    },
  ];

  return (
    <div>
      <div className="table-toolbar">
        <input
          className="search"
          type="search"
          placeholder="Search providers"
          aria-label="Search providers"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="table-count">
          {rows.length === data.providers.length ? `${rows.length} providers` : `${rows.length} of ${data.providers.length} providers`}
        </span>
      </div>
      <DataTable
        caption="Provider documentation status"
        columns={columns}
        rows={rows}
        rowKey={(p) => p.name}
        rowHref={(p) => providerHref(p.name)}
        emptyMessage={`No providers match “${query}”.`}
      />
      <p className="section-note">
        <span className="completion">
          <span className="coverage-flag" aria-hidden="true" /> Completion describes only notes with a known status; the dot marks providers
          with status coverage below {ATTENTION_CRITERIA.lowCoveragePercent}%.
        </span>
      </p>
    </div>
  );
}
