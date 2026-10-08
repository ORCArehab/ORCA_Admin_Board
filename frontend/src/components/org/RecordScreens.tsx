"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { createFacility, createStaff, getFacility, getStaff, setStaffAccess, updateFacility, updateStaff } from "@/lib/org/api";
import { listPeople } from "@/lib/people";
import { FACILITY_DEFAULTS, facilitySections, STAFF_DEFAULTS, staffSections } from "@/lib/org/fields";
import { toFormValues } from "@/lib/org/form";
import {
  isSchedulable,
  showsCredentialing,
  staffPersonalContact,
  staffAdditional,
  staffPosition,
  staffOverview,
  staffStatus,
  staffSubtitle,
} from "@/lib/org/profile";
import { ACCESS_STATUS_LABELS, labelFor, systemLabel, type Facility, type StaffAccess, type StaffDetail } from "@/lib/org/types";
import { useOrgResource } from "@/lib/org/useOrgResource";
import { AssignmentsSection } from "./AssignmentsSection";
import { EmployeeAccess } from "./EmployeeAccess";
import { EmployeeCredentialing } from "./EmployeeCredentialing";
import { EmployeeDocuments } from "./EmployeeDocuments";
import { FacilityProfile } from "./FacilityProfile";
import { Avatar, DetailList, History, LinkRows, ProfileHeader, ProfileSection, SourceNote } from "./ProfileParts";
import { RecordForm } from "./RecordForm";

const facilityValues = (sections: ReturnType<typeof facilitySections>, f: Facility) => toFormValues(sections, { ...f, archived: f.archivedAt !== null });

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

const employeesBack = (
  <Link className="back-link" href="/employees">
    ← Employees
  </Link>
);

/** Splits an account's display name into first and last for the form; the admin can correct it. */
function nameParts(name: string | null): { firstName?: string; lastName?: string } {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words.length ? { firstName: words[0] } : {};
  return { firstName: words.slice(0, -1).join(" "), lastName: words[words.length - 1] };
}

/**
 * "New employee". From Accounts without a record, `account` prefills the form and, once saved,
 * links that sign-in account to the new record (keeping its roles), so it moves into Employees.
 */
export function NewEmployeeScreen({ account = null }: { account?: { email: string; name: string | null } | null }) {
  const router = useRouter();
  const sections = useMemo(() => staffSections(true), []);
  const defaults = useMemo(
    () => toFormValues(sections, null, { ...STAFF_DEFAULTS, ...(account ? { workEmail: account.email, ...nameParts(account.name) } : {}) }),
    [sections, account],
  );
  return (
    <>
      <PageHeader
        back={employeesBack}
        title="New employee"
        description={
          account
            ? `Creates the employee record for ${account.email} and links their sign-in account to it. A staff number is assigned when it's saved.`
            : "Adds a staff record. A staff number is assigned when it's saved."
        }
      />
      <RecordForm
        sections={sections}
        initial={null}
        defaults={defaults}
        submitLabel="Create employee"
        onCancel={() => router.push(account ? "/employees?view=accounts" : "/employees")}
        onSubmit={async (payload) => {
          const staff = await createStaff(payload);
          if (account) {
            // Link the account, keeping whatever roles it already has. If that fails, the record
            // still exists and Access on the profile can link it.
            const person = (await listPeople().catch(() => [])).find((p) => p.email.toLowerCase() === account.email.toLowerCase());
            await setStaffAccess(staff.id, person?.roles ?? [], account.email).catch(() => null);
          }
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

  return (
    <EmployeeProfile
      detail={state.data}
      flash={flash}
      onEdit={() => switchTo("edit")}
      onAccessSaved={(access, message) => {
        state.replace((d) => ({ ...d, staff: { ...d.staff, access } }));
        state.reload(); // refreshes the activity list
        setFlash(message);
      }}
      onAssignmentsChanged={(message) => {
        state.reload();
        setFlash(message);
      }}
    />
  );
}

/** The read-only employee profile (presentational; EmployeeScreen loads the data and owns edit mode). */
export function EmployeeProfile({
  detail,
  flash,
  onEdit,
  onAccessSaved = () => {},
  onAssignmentsChanged = () => {},
}: {
  detail: StaffDetail;
  flash: string | null;
  onEdit: () => void;
  onAccessSaved?: (access: StaffAccess, message: string) => void;
  onAssignmentsChanged?: (message: string) => void;
}) {
  const { staff, assignments, sourceOwned, events } = detail;
  const schedulable = isSchedulable(staff);
  return (
    <>
      <ProfileHeader
        back={employeesBack}
        badge={<Avatar name={staff.displayName} size="lg" />}
        title={staff.displayName}
        subtitle={staffSubtitle(staff)}
        meta={[staffPosition(staff), staffStatus(staff), !staff.directoryVisible && "Hidden from the directory"]}
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
          {staffPersonalContact(staff).length > 0 && (
            <ProfileSection title="Personal contact">
              <DetailList items={staffPersonalContact(staff)} />
            </ProfileSection>
          )}
          <EmployeeAccess staff={staff} onSaved={onAccessSaved} />
          <AssignmentsSection
            side="employee"
            ownerId={staff.id}
            title="Facility assignments"
            rows={assignments.map((a) => ({ id: a.id, type: a.type, effectiveFrom: a.effectiveFrom, other: { id: a.facility.id, label: a.facility.name, href: `/facilities/${a.facility.id}` } }))}
            empty="Not assigned to any facility."
            onChanged={onAssignmentsChanged}
          />
          {schedulable && (
            <ProfileSection title="Schedule">
              <p className="profile-note profile-note-lead">This provider&apos;s entries on the weekly schedule board.</p>
              <Link className="button" href={`/schedule?provider=${encodeURIComponent(staff.id)}`}>
                View schedule
              </Link>
            </ProfileSection>
          )}
          {showsCredentialing(staff) && <EmployeeCredentialing staff={staff} />}
          {detail.facilityAccess && detail.facilityAccess.length > 0 && (
            <ProfileSection title="Hospital logins">
              <LinkRows
                rows={detail.facilityAccess.map((a) => ({
                  id: a.id,
                  label: `${a.facility.abbreviation ? `${a.facility.abbreviation} · ` : ""}${a.facility.name}`,
                  href: `/facilities/${a.facility.id}`,
                  detail: [systemLabel(a), a.username, labelFor(ACCESS_STATUS_LABELS, a.status), (a.usernameSetVia === "portal" || a.passwordSetVia === "portal") && "updated by the provider"].filter(Boolean).join(" · "),
                }))}
                empty=""
              />
              <p className="profile-note">Managed on each facility&apos;s page.</p>
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

export function FacilityScreen({ id, created, tab }: { id: string; created: boolean; tab?: string }) {
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

  return (
    <FacilityProfile
      detail={state.data}
      flash={flash}
      initialTab={tab}
      onEdit={() => switchTo("edit")}
      onContactsChanged={(contacts, message) => {
        state.replace((d) => ({ ...d, contacts }));
        state.reload(); // refreshes activity
        setFlash(message);
      }}
      onAccessChanged={(logins) => {
        state.replace((d) => ({ ...d, access: { logins, pcc: logins.filter((a) => a.system === "pcc") } }));
        state.reload(); // refreshes activity
      }}
      onAssignmentsChanged={(message) => {
        state.reload(); // assignments, hospital-login "assigned" flags and activity
        setFlash(message);
      }}
    />
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
