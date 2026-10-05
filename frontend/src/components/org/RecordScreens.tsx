"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { createFacility, createStaff, getFacility, getStaff, updateFacility, updateStaff } from "@/lib/org/api";
import { FACILITY_DEFAULTS, facilitySections, STAFF_DEFAULTS, staffSections } from "@/lib/org/fields";
import { toFormValues } from "@/lib/org/form";
import { EMPLOYMENT_STATUS_LABELS, labelFor, OPERATIONAL_STATUS_LABELS, type Facility, type OrgEvent } from "@/lib/org/types";
import { useOrgResource } from "@/lib/org/useOrgResource";
import { RecordForm } from "./RecordForm";

const ASSIGNMENT_LABELS: Record<string, string> = {
  rounding_provider: "Rounding provider",
  scribe_coverage: "Scribe coverage",
  credentialed: "Credentialed",
  liaison: "Liaison",
  other: "Other",
};

const facilityValues = (sections: ReturnType<typeof facilitySections>, f: Facility) => toFormValues(sections, { ...f, archived: f.archivedAt !== null });

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

const employeesBack = (
  <Link className="back-link" href="/employees">
    ← Employees
  </Link>
);

export function NewEmployeeScreen() {
  const router = useRouter();
  const sections = useMemo(() => staffSections(true), []);
  return (
    <>
      <PageHeader back={employeesBack} title="New employee" description="Adds a staff record. A staff number is assigned when it's saved." />
      <RecordForm
        sections={sections}
        initial={null}
        defaults={toFormValues(sections, null, STAFF_DEFAULTS)}
        submitLabel="Create employee"
        onCancel={() => router.push("/employees")}
        onSubmit={async (payload) => {
          const staff = await createStaff(payload);
          router.push(`/employees/${staff.id}?created=1`);
        }}
      />
    </>
  );
}

export function EmployeeScreen({ id, created }: { id: string; created: boolean }) {
  const state = useOrgResource(() => getStaff(id), [id]);
  const sections = useMemo(() => staffSections(false), []);

  if (state.status !== "ready") {
    return (
      <>
        <PageHeader back={employeesBack} title="Employee" />
        {state.status === "loading" ? <LoadingState /> : <ErrorState error={state.error} />}
      </>
    );
  }
  const { staff, assignments, sourceOwned, events } = state.data;
  return (
    <>
      <PageHeader
        back={employeesBack}
        title={staff.displayName}
        description={
          <>
            <span className="num">{staff.staffNumber}</span> · {labelFor(EMPLOYMENT_STATUS_LABELS, staff.employmentStatus)}
            {!staff.directoryVisible && " · hidden from the directory"}
          </>
        }
      />
      {created && <p className="record-banner" role="status">Employee created.</p>}
      <div className="record-layout">
        <RecordForm
          key={staff.id}
          sections={sections}
          initial={toFormValues(sections, staff)}
          defaults={{}}
          submitLabel="Save changes"
          onSubmit={async (payload) => {
            const result = await updateStaff(id, payload);
            state.reload();
            return toFormValues(sections, result.staff);
          }}
        />
        <aside className="record-aside">
          {sourceOwned && <SourceNote source="Master HR" />}
          <section className="panel">
            <h2>Facility assignments</h2>
            {assignments.length === 0 ? (
              <p className="panel-note">None.</p>
            ) : (
              <ul className="record-list">
                {assignments.map((a) => (
                  <li key={a.id}>
                    <Link className="table-link" href={`/facilities/${a.facility.id}`}>
                      {a.facility.name}
                    </Link>
                    <span className="muted">
                      {ASSIGNMENT_LABELS[a.type] ?? a.type}
                      {a.effectiveFrom && ` · since ${formatDate(a.effectiveFrom)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="panel-note">Assignments are managed in the employee portal.</p>
          </section>
          <History events={events} />
        </aside>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------

const facilitiesBack = (
  <Link className="back-link" href="/facilities">
    ← Facilities
  </Link>
);

export function NewFacilityScreen() {
  const router = useRouter();
  const sections = useMemo(() => facilitySections(true), []);
  return (
    <>
      <PageHeader back={facilitiesBack} title="New facility" description="Adds a facility record. A facility number is assigned when it's saved." />
      <RecordForm
        sections={sections}
        initial={null}
        defaults={toFormValues(sections, null, FACILITY_DEFAULTS)}
        submitLabel="Create facility"
        onCancel={() => router.push("/facilities")}
        onSubmit={async (payload) => {
          const facility = await createFacility(payload);
          router.push(`/facilities/${facility.id}?created=1`);
        }}
      />
    </>
  );
}

export function FacilityScreen({ id, created }: { id: string; created: boolean }) {
  const state = useOrgResource(() => getFacility(id), [id]);
  const sections = useMemo(() => facilitySections(false), []);

  if (state.status !== "ready") {
    return (
      <>
        <PageHeader back={facilitiesBack} title="Facility" />
        {state.status === "loading" ? <LoadingState /> : <ErrorState error={state.error} />}
      </>
    );
  }
  const { facility, aliases, assignments, sourceOwned, events } = state.data;
  const otherNames = aliases.filter((a) => a.type !== "canonical_name" && a.type !== "abbreviation");
  return (
    <>
      <PageHeader
        back={facilitiesBack}
        title={facility.abbreviation ? `${facility.abbreviation} · ${facility.name}` : facility.name}
        description={
          <>
            <span className="num">{facility.facilityNumber}</span> · {labelFor(OPERATIONAL_STATUS_LABELS, facility.operationalStatus)}
            {facility.archivedAt && " · archived"}
          </>
        }
      />
      {created && <p className="record-banner" role="status">Facility created.</p>}
      <div className="record-layout">
        <RecordForm
          key={facility.id}
          sections={sections}
          initial={facilityValues(sections, facility)}
          defaults={{}}
          submitLabel="Save changes"
          onSubmit={async (payload) => {
            const result = await updateFacility(id, payload);
            state.reload();
            return facilityValues(sections, result.facility);
          }}
        />
        <aside className="record-aside">
          {sourceOwned && <SourceNote source="Master HIM 1" />}
          <section className="panel">
            <h2>Also known as</h2>
            {otherNames.length === 0 ? (
              <p className="panel-note">No other names.</p>
            ) : (
              <ul className="record-list">
                {otherNames.map((a) => (
                  <li key={a.id}>
                    {a.alias}
                    <span className="muted">{a.type.replace(/_/g, " ")}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="panel-note">A renamed facility keeps its old name here, so trackers that still use it find this record.</p>
          </section>
          <section className="panel">
            <h2>Staff assigned</h2>
            {assignments.length === 0 ? (
              <p className="panel-note">None.</p>
            ) : (
              <ul className="record-list">
                {assignments.map((a) => (
                  <li key={a.id}>
                    <Link className="table-link" href={`/employees/${a.staff.id}`}>
                      {a.staff.displayName}
                    </Link>
                    <span className="muted">{ASSIGNMENT_LABELS[a.type] ?? a.type}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <History events={events} />
        </aside>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function SourceNote({ source }: { source: string }) {
  return (
    <p className="panel record-source">
      First imported from {source}. If that spreadsheet is imported again, anything changed here shows up as a proposed update for review, never
      applied on its own.
    </p>
  );
}

const ACTION_LABELS: Record<string, string> = {
  created: "Created",
  updated: "Changed",
  alias_added: "Name added",
  alias_removed: "Name removed",
  person_linked: "Sign-in account linked",
  person_unlinked: "Sign-in account unlinked",
};

/** Who changed what, and when. The API records field names only, never values. */
function History({ events }: { events: OrgEvent[] }) {
  const recent = events.slice(0, 12);
  return (
    <section className="panel">
      <h2>History</h2>
      {recent.length === 0 ? (
        <p className="panel-note">No changes recorded.</p>
      ) : (
        <ul className="record-list record-history">
          {recent.map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <span>
                {ACTION_LABELS[e.action] ?? e.action}
                {e.action === "updated" && e.fields.length > 0 && <span className="muted"> {e.fields.map((f) => f.replace(/_/g, " ")).join(", ")}</span>}
              </span>
              <span className="muted">
                {e.actor.startsWith("import:") ? "Import" : e.actor} · {formatDate(e.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
