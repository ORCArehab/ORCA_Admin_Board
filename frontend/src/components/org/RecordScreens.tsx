"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { createFacility, createStaff, getFacility, getStaff, updateFacility, updateStaff } from "@/lib/org/api";
import { FACILITY_DEFAULTS, facilitySections, STAFF_DEFAULTS, staffSections } from "@/lib/org/fields";
import { toFormValues } from "@/lib/org/form";
import {
  addressLines,
  facilityAdditional,
  facilityContact,
  facilityStatus,
  facilityType,
  isSchedulable,
  staffAdditional,
  staffCategory,
  staffOverview,
  staffStatus,
  staffSubtitle,
} from "@/lib/org/profile";
import type { Facility, FacilityDetail, StaffDetail } from "@/lib/org/types";
import { useOrgResource } from "@/lib/org/useOrgResource";
import { EmployeeDocuments } from "./EmployeeDocuments";
import { Avatar, DetailList, History, LinkRows, ProfileHeader, ProfileSection, SourceNote } from "./ProfileParts";
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
  const [mode, setMode] = useState<Mode>("view");
  const [flash, setFlash] = useState<string | null>(created ? "Employee created." : null);
  const switchTo = (next: Mode) => {
    setMode(next);
    if (next === "edit") setFlash(null);
    window.scrollTo({ top: 0 });
  };

  if (state.status !== "ready") {
    return (
      <>
        <PageHeader back={employeesBack} title="Employee" />
        {state.status === "loading" ? <LoadingState /> : <ErrorState error={state.error} />}
      </>
    );
  }
  const { staff, sourceOwned } = state.data;

  if (mode === "edit") {
    return (
      <>
        <PageHeader
          back={<BackButton label="Back to profile" onClick={() => switchTo("view")} />}
          title={`Edit ${staff.displayName}`}
          description="Changes are saved to the shared staff record and listed in its activity."
        />
        {sourceOwned && <SourceNote source="Master HR" />}
        <RecordForm
          key={staff.id}
          sections={sections}
          initial={toFormValues(sections, staff)}
          defaults={{}}
          submitLabel="Save changes"
          onCancel={() => switchTo("view")}
          onSubmit={async (payload) => {
            const result = await updateStaff(id, payload);
            state.replace((d) => ({ ...d, staff: result.staff }));
            state.reload(); // refreshes the activity list
            setFlash("Changes saved.");
            switchTo("view");
          }}
        />
      </>
    );
  }

  return <EmployeeProfile detail={state.data} flash={flash} onEdit={() => switchTo("edit")} />;
}

/** The read-only employee profile (presentational; EmployeeScreen loads the data and owns edit mode). */
export function EmployeeProfile({ detail, flash, onEdit }: { detail: StaffDetail; flash: string | null; onEdit: () => void }) {
  const { staff, assignments, sourceOwned, events } = detail;
  const schedulable = isSchedulable(staff);
  return (
    <>
      <ProfileHeader
        back={employeesBack}
        badge={<Avatar name={staff.displayName} size="lg" />}
        title={staff.displayName}
        subtitle={staffSubtitle(staff)}
        meta={[staffCategory(staff), staffStatus(staff), !staff.directoryVisible && "Hidden from the directory"]}
        action={
          <button type="button" className="button button-primary-sm" onClick={onEdit}>
            Edit employee
          </button>
        }
      />
      {flash && <p className="record-banner" role="status">{flash}</p>}
      <div className="profile-layout">
        <div className="profile-main">
          <ProfileSection title="Overview">
            <DetailList items={staffOverview(staff)} empty="No details recorded yet." />
          </ProfileSection>
          <ProfileSection title="Facility assignments">
            <LinkRows
              rows={assignments.map((a) => ({
                id: a.id,
                label: a.facility.name,
                href: `/facilities/${a.facility.id}`,
                detail: [ASSIGNMENT_LABELS[a.type] ?? a.type, a.effectiveFrom && `since ${formatDate(a.effectiveFrom)}`].filter(Boolean).join(" · "),
              }))}
              empty="No facility assignments."
            />
            <p className="profile-note">Assignments are managed in the employee portal. Open a facility to see everyone assigned there.</p>
          </ProfileSection>
          {schedulable && (
            <ProfileSection title="Schedule">
              <p className="profile-note profile-note-lead">This provider&apos;s entries on the weekly schedule board.</p>
              <Link className="button" href={`/schedule?provider=${encodeURIComponent(staff.id)}`}>
                View schedule
              </Link>
            </ProfileSection>
          )}
          <EmployeeDocuments staffId={staff.id} />
          <ProfileSection title="Additional information">
            <DetailList items={staffAdditional(staff)} />
          </ProfileSection>
        </div>
        <aside className="profile-aside">
          {sourceOwned && <SourceNote source="Master HR" />}
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
  const [mode, setMode] = useState<Mode>("view");
  const [flash, setFlash] = useState<string | null>(created ? "Facility created." : null);
  const switchTo = (next: Mode) => {
    setMode(next);
    if (next === "edit") setFlash(null);
    window.scrollTo({ top: 0 });
  };

  if (state.status !== "ready") {
    return (
      <>
        <PageHeader back={facilitiesBack} title="Facility" />
        {state.status === "loading" ? <LoadingState /> : <ErrorState error={state.error} />}
      </>
    );
  }
  const { facility, sourceOwned } = state.data;

  if (mode === "edit") {
    return (
      <>
        <PageHeader
          back={<BackButton label="Back to profile" onClick={() => switchTo("view")} />}
          title={`Edit ${facility.name}`}
          description="Changes are saved to the shared facility record and listed in its activity."
        />
        {sourceOwned && <SourceNote source="Master HIM 1" />}
        <RecordForm
          key={facility.id}
          sections={sections}
          initial={facilityValues(sections, facility)}
          defaults={{}}
          submitLabel="Save changes"
          onCancel={() => switchTo("view")}
          onSubmit={async (payload) => {
            const result = await updateFacility(id, payload);
            state.replace((d) => ({ ...d, facility: result.facility }));
            state.reload(); // refreshes names and activity
            setFlash("Changes saved.");
            switchTo("view");
          }}
        />
      </>
    );
  }

  return <FacilityProfile detail={state.data} flash={flash} onEdit={() => switchTo("edit")} />;
}

/** The read-only facility profile (presentational; FacilityScreen loads the data and owns edit mode). */
export function FacilityProfile({ detail, flash, onEdit }: { detail: FacilityDetail; flash: string | null; onEdit: () => void }) {
  const { facility, assignments, sourceOwned, events } = detail;
  const address = addressLines(facility.address);
  return (
    <>
      <ProfileHeader
        back={facilitiesBack}
        badge={facility.abbreviation ? <span className="facility-badge facility-badge-lg">{facility.abbreviation}</span> : <Avatar name={facility.name} size="lg" />}
        title={facility.name}
        meta={[facilityType(facility), facility.address.city, facilityStatus(facility)]}
        action={
          <button type="button" className="button button-primary-sm" onClick={onEdit}>
            Edit facility
          </button>
        }
      />
      {flash && <p className="record-banner" role="status">{flash}</p>}
      <div className="profile-layout">
        <div className="profile-main">
          <ProfileSection title="Location">
            {address.length > 0 || facility.county ? (
              <address className="profile-address">
                {address.map((line) => (
                  <span key={line}>{line}</span>
                ))}
                {facility.county && <span className={address.length > 0 ? "muted" : undefined}>{facility.county} County</span>}
              </address>
            ) : (
              <p className="profile-empty">No address recorded.</p>
            )}
          </ProfileSection>
          <ProfileSection title="Contact">
            <DetailList items={facilityContact(facility)} empty="No phone, fax or email recorded." />
          </ProfileSection>
          <ProfileSection
            title="Assigned staff"
            action={
              <Link className="text-link profile-section-link" href={`/schedule?view=facilities&facility=${encodeURIComponent(facility.id)}`}>
                View schedule
              </Link>
            }
          >
            <LinkRows
              rows={assignments.map((a) => ({ id: a.id, label: a.staff.displayName, href: `/employees/${a.staff.id}`, detail: ASSIGNMENT_LABELS[a.type] ?? a.type }))}
              empty="No staff assigned."
            />
          </ProfileSection>
          <ProfileSection title="Additional information">
            <DetailList items={facilityAdditional(detail)} />
          </ProfileSection>
        </div>
        <aside className="profile-aside">
          {sourceOwned && <SourceNote source="Master HIM 1" />}
          <History events={events} />
        </aside>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

type Mode = "view" | "edit";

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="back-link back-button" onClick={onClick}>
      ← {label}
    </button>
  );
}
