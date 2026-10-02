"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { DataFreshness } from "@/components/DataFreshness";
import { ProductionTable } from "@/components/scribes/ProductionTable";
import { ScopeLine } from "@/components/scribes/ScopeLine";
import { ErrorState, LoadingState, PageHeader, Section, SourceNote } from "@/components/ui";
import { EMPTY, formatCount, formatDate, formatDecimal } from "@/lib/format";
import type { ScribeDashboard, ScribeEntry } from "@/lib/scribeTypes";
import { useScribeDashboard } from "@/lib/useScribeDashboard";

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function ScribeDetailPage() {
  const params = useParams<{ name: string }>();
  const name = safeDecode(params.name);
  const state = useScribeDashboard();
  const scribe = state.status === "ready" ? state.data.scribes.find((s) => s.name === name) : undefined;
  return (
    <>
      <PageHeader
        back={
          <Link className="back-link" href="/scribes">
            ← Scribes
          </Link>
        }
        title={name}
        aside={state.status === "ready" ? <DataFreshness fetchedAt={state.data.meta.source.fetchedAt} timezone={state.data.meta.timezone} refreshing={state.refreshing} onRefresh={state.refresh} /> : undefined}
      />
      {state.status === "loading" && <LoadingState />}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" &&
        (scribe ? (
          <ScribeDetail scribe={scribe} data={state.data} />
        ) : (
          <div className="state">
            <h2>Scribe not found</h2>
            No scribe named “{name}” appears in Daily Production for the reporting period.
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

function ScribeDetail({ scribe: s, data }: { scribe: ScribeEntry; data: ScribeDashboard }) {
  const defs = data.meta.definitions;
  return (
    <>
      <ScopeLine meta={data.meta} />
      {s.warningCount > 0 && (
        <div className="notice" role="note">
          <SourceNote>Some source data needs review.</SourceNote>
        </div>
      )}
      <div className="detail-grid section">
        <section className="panel" aria-labelledby="prod-h">
          <h2 id="prod-h">Production</h2>
          <dl className="stats">
            <Stat label="Notes produced" value={formatCount(s.notesProduced)} hint={defs.notesProduced} />
            <Stat label="Consults" value={formatCount(s.consults)} />
            <Stat label="Follow-ups" value={formatCount(s.followUps)} />
          </dl>
        </section>
        <section className="panel" aria-labelledby="time-h">
          <h2 id="time-h">Time</h2>
          <dl className="stats">
            <Stat label="Hours worked" value={formatDecimal(s.hoursWorked)} hint={defs.hoursWorked} />
            <Stat label="Notes per hour" value={formatDecimal(s.notesPerHour)} hint={defs.notesPerHour} />
            <Stat label="Sessions" value={formatCount(s.sessions)} />
            <Stat label="Work days" value={formatCount(s.workDays)} />
          </dl>
          <p className="panel-note">Hours include every session, including upload-only sessions.</p>
        </section>
        <section className="panel" aria-labelledby="up-h">
          <h2 id="up-h">Upload activity</h2>
          <dl className="stats">
            <Stat label="Notes uploaded" value={formatCount(s.notesUploaded)} hint={defs.notesUploaded} />
          </dl>
          <p className="panel-note">Uploads can be for notes produced on earlier dates, so they are shown separately and not compared with production.</p>
        </section>
        <section className="panel" aria-labelledby="fac-h">
          <h2 id="fac-h">Facilities</h2>
          <dl className="stats">
            <Stat label="Facilities worked" value={formatCount(s.facilitiesWorked)} hint={defs.facilitiesWorked} />
            <Stat label="Multi-facility entries" value={formatCount(s.multiFacilityEntries)} hint={defs.multiFacilityEntries} />
            <Stat label="Notes not attributed to a facility" value={formatCount(s.unallocatedFacilityNotes)} />
            <Stat label="Active" value={s.firstWorkDate && s.lastWorkDate ? `${formatDate(s.firstWorkDate)} – ${formatDate(s.lastWorkDate)}` : EMPTY} />
          </dl>
        </section>
      </div>
      <Section title="Production over time">
        <ProductionTable series={s.production} scope={{ from: data.meta.scope.historyStartsOn, to: data.meta.scope.dataThrough }} />
      </Section>
    </>
  );
}
