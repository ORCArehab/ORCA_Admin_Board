"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { DataFreshness } from "@/components/providers/DataFreshness";
import { ErrorState, LoadingState, PageHeader, SourceNote } from "@/components/ui";
import { hasLimitedCoverage } from "@/lib/attention";
import { EMPTY, formatCount, formatDate, formatDays, formatPercent } from "@/lib/format";
import type { ProviderDashboard, ProviderEntry } from "@/lib/types";
import { useProviderDashboard } from "@/lib/useProviderDashboard";

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const back = (
  <Link className="back-link" href="/providers">
    ← Providers
  </Link>
);

export default function ProviderDetailPage() {
  const params = useParams<{ name: string }>();
  const name = safeDecode(params.name);
  const state = useProviderDashboard();
  const provider = state.status === "ready" ? state.data.providers.find((p) => p.name === name) : undefined;

  return (
    <>
      <PageHeader
        back={back}
        title={name}
        aside={state.status === "ready" ? <DataFreshness data={state.data} refreshing={state.refreshing} onRefresh={state.refresh} /> : undefined}
      />
      {state.status === "loading" && <LoadingState />}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" &&
        (provider ? (
          <ProviderDetail provider={provider} data={state.data} />
        ) : (
          <div className="state">
            <h2>Provider not found</h2>
            No provider named “{name}” is in the current tracker.
          </div>
        ))}
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="stat" title={hint}>
      <dt>{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  );
}

function ProviderDetail({ provider: p, data }: { provider: ProviderEntry; data: ProviderDashboard }) {
  const defs = data.meta.definitions;
  const needsReview = p.dataStatus === "incomplete" || p.warningCount > 0;
  return (
    <>
      {needsReview && (
        <div className="notice" role="note">
          <SourceNote>
            Some source data needs review
            {p.dataStatus === "incomplete" ? " — part of this provider's tracker could not be read." : "."}
          </SourceNote>
        </div>
      )}
      {hasLimitedCoverage(p) && (
        <div className="notice" role="note">
          Completion is based on {formatCount(p.classifiedNotes)} of {formatCount(p.expectedNotes)} notes that have a known upload status (
          {formatPercent(p.statusCoveragePercent)} status coverage).
        </div>
      )}

      <div className="detail-grid">
        <section className="panel" aria-labelledby="notes-h">
          <h2 id="notes-h">Notes</h2>
          <dl className="stats">
            <Stat label="Expected" value={formatCount(p.expectedNotes)} />
            <Stat label="Completed" value={formatCount(p.completedNotes)} />
            <Stat label="Outstanding" value={formatCount(p.outstandingNotes)} hint="Upload status is explicitly not uploaded" />
            <Stat label="Unknown status" value={formatCount(p.unknownStatusNotes)} hint={defs.unknownStatusNotes} />
          </dl>
          <p className="panel-note">
            Outstanding notes are explicitly marked not uploaded. Unknown-status notes have a blank or free-text upload status and are counted
            as neither completed nor outstanding.
          </p>
        </section>

        <section className="panel" aria-labelledby="status-h">
          <h2 id="status-h">Completion</h2>
          <dl className="stats">
            <Stat label="Completion rate" value={formatPercent(p.completionRate)} hint={defs.completionRate} />
            <Stat label="Status coverage" value={formatPercent(p.statusCoveragePercent)} hint={defs.statusCoveragePercent} />
          </dl>
          <p className="panel-note">
            Completion rate describes notes with a known status. Status coverage describes how much of the expected workload has a known
            status.
          </p>
        </section>

        <section className="panel" aria-labelledby="backlog-h">
          <h2 id="backlog-h">Backlog</h2>
          <dl className="stats">
            <Stat label="Outstanding batches" value={formatCount(p.outstandingBatches)} hint={defs.outstandingBatches} />
            <Stat
              label="Oldest outstanding"
              value={
                p.oldestOutstandingDays === null ? (
                  EMPTY
                ) : (
                  <>
                    {formatDays(p.oldestOutstandingDays)}
                    {p.oldestOutstandingVisitDate && <span className="muted"> · visit {formatDate(p.oldestOutstandingVisitDate)}</span>}
                  </>
                )
              }
            />
            <Stat label="Billing sheet backlog" value={`${formatCount(p.billingSheetBacklog)} batches`} />
            <Stat label="Facesheet backlog" value={`${formatCount(p.facesheetBacklog)} batches`} />
          </dl>
        </section>

        <section className="panel" aria-labelledby="volume-h">
          <h2 id="volume-h">Volume</h2>
          <dl className="stats">
            <Stat label="Consults" value={formatCount(p.consults)} />
            <Stat label="Follow-ups" value={formatCount(p.followUps)} />
          </dl>
        </section>
      </div>
    </>
  );
}
