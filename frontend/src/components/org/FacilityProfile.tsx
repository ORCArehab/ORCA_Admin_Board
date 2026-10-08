"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useRoles } from "@/components/RolesProvider";
import { canManageFacilityAccess, canSee } from "@/lib/access";
import { mapsUrl } from "@/lib/org/contacts";
import { addressLines, facilityAdditional, facilityStatus, facilityType } from "@/lib/org/profile";
import { DEFAULT_CONTACT_ROLES, facilityLogins, type FacilityAccess, type FacilityContact, type FacilityDetail } from "@/lib/org/types";
import { AssignmentsSection } from "./AssignmentsSection";
import { FacilityAccessSection } from "./FacilityAccessSection";
import { FacilityContacts } from "./FacilityContacts";
import { FacilityWeek } from "./FacilityWeek";
import { ExternalIcon, FaxIcon, MailIcon, PhoneIcon, PinIcon } from "./Icons";
import { Avatar, DetailList, History, ProfileHeader, ProfileSection, SourceNote } from "./ProfileParts";

const TABS = ["overview", "contacts", "providers", "scheduling", "logins"] as const;
type Tab = (typeof TABS)[number];
const isTab = (value: unknown): value is Tab => typeof value === "string" && (TABS as readonly string[]).includes(value);

const back = (
  <Link className="back-link" href="/facilities">
    ← Facilities
  </Link>
);

/**
 * The facility profile, in tabs: Overview (where it is and how to reach it), Contacts (DON, DOR,
 * IT / EHR, ...), Providers (assignments), Scheduling (this week's schedule there, admins) and
 * Hospital logins (ADMIN, HIM). The tab is kept in the URL (?tab=) so it can be linked to.
 * Presentational: FacilityScreen loads the data and owns edit mode.
 */
export function FacilityProfile({
  detail,
  flash,
  initialTab,
  onEdit,
  onAccessChanged = () => {},
  onAssignmentsChanged = () => {},
  onContactsChanged = () => {},
}: {
  detail: FacilityDetail;
  flash: string | null;
  initialTab?: string;
  onEdit: () => void;
  onAccessChanged?: (logins: FacilityAccess[]) => void;
  onAssignmentsChanged?: (message: string) => void;
  onContactsChanged?: (contacts: FacilityContact[], message: string) => void;
}) {
  const roles = useRoles();
  const { facility, assignments } = detail;
  const logins = facilityLogins(detail);
  const showContacts = detail.contacts !== undefined;
  const showSchedule = canSee(roles, "schedule");
  const showLogins = canManageFacilityAccess(roles) && !!detail.access;
  const visible: Tab[] = TABS.filter((t) => (t === "contacts" ? showContacts : t === "scheduling" ? showSchedule : t === "logins" ? showLogins : true));
  const [tab, setTab] = useState<Tab>(isTab(initialTab) && visible.includes(initialTab) ? initialTab : "overview");
  const providerCount = new Set(assignments.map((a) => a.staff.id)).size;

  const choose = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  };

  const labels: Record<Tab, ReactNode> = {
    overview: "Overview",
    contacts: <>Contacts{detail.contacts?.length ? <span className="tab-count">{detail.contacts.length}</span> : null}</>,
    providers: <>Providers{providerCount ? <span className="tab-count">{providerCount}</span> : null}</>,
    scheduling: "Scheduling",
    logins: <>Hospital logins{logins.length ? <span className="tab-count">{logins.length}</span> : null}</>,
  };

  return (
    <>
      <ProfileHeader
        back={back}
        badge={facility.abbreviation ? <span className="facility-badge facility-badge-lg">{facility.abbreviation}</span> : <Avatar name={facility.name} size="lg" />}
        title={facility.name}
        meta={[facilityType(facility), facility.address.city, facilityStatus(facility) !== "Active" && facilityStatus(facility)]}
        action={
          <button type="button" className="button button-primary-sm" onClick={onEdit}>
            Edit facility
          </button>
        }
      />
      <nav className="profile-tabs" role="tablist" aria-label="Facility">
        {visible.map((t) => (
          <button key={t} type="button" role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls={`panel-${t}`} className="profile-tab" onClick={() => choose(t)}>
            {labels[t]}
          </button>
        ))}
      </nav>
      {flash && (
        <p className="record-banner" role="status">
          {flash}
        </p>
      )}
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="profile-tabpanel">
        {tab === "overview" && <Overview detail={detail} />}
        {tab === "contacts" && (
          <FacilityContacts
            facilityId={facility.id}
            contacts={detail.contacts ?? []}
            roles={detail.contactRoles ?? DEFAULT_CONTACT_ROLES}
            canEdit={canManageFacilityAccess(roles)}
            onChanged={onContactsChanged}
          />
        )}
        {tab === "providers" && (
          <AssignmentsSection
            side="facility"
            ownerId={facility.id}
            title="Assigned staff"
            rows={assignments.map((a) => ({
              id: a.id,
              type: a.type,
              effectiveFrom: a.effectiveFrom,
              other: { id: a.staff.id, label: a.staff.displayName, href: canSee(roles, "employees") ? `/employees/${a.staff.id}` : undefined },
            }))}
            empty="No staff assigned."
            onChanged={onAssignmentsChanged}
          />
        )}
        {tab === "scheduling" && <FacilityWeek facilityId={facility.id} />}
        {tab === "logins" && <FacilityAccessSection detail={detail} onChanged={onAccessChanged} />}
      </div>
    </>
  );
}

function Overview({ detail }: { detail: FacilityDetail }) {
  const f = detail.facility;
  const address = addressLines(f.address);
  return (
    <div className="profile-layout">
      <div className="profile-main">
        <div className="info-rows">
          <InfoRow icon={<PinIcon />} label="Location">
            {address.length > 0 ? (
              <>
                <address className="info-address">
                  {address.map((line, i) => (
                    <span key={line} className={i === 0 ? "info-primary" : undefined}>
                      {line}
                    </span>
                  ))}
                  {f.county && <span className="muted">{f.county} County</span>}
                </address>
                <a className="text-link info-link" href={mapsUrl(address)} target="_blank" rel="noopener noreferrer">
                  View on Google Maps <ExternalIcon />
                </a>
              </>
            ) : (
              <span className="muted">No address recorded.</span>
            )}
          </InfoRow>
          <InfoRow icon={<PhoneIcon />} label="Facility phone">
            {f.phone ? (
              <a className="text-link info-primary" href={`tel:${f.phone.replace(/[^\d+]/g, "")}`}>
                {f.phone}
              </a>
            ) : (
              <span className="muted">Not recorded.</span>
            )}
          </InfoRow>
          {f.fax && (
            <InfoRow icon={<FaxIcon />} label="Fax">
              <span className="info-primary">{f.fax}</span>
            </InfoRow>
          )}
          {f.email && (
            <InfoRow icon={<MailIcon />} label="Email">
              <a className="text-link info-primary" href={`mailto:${f.email}`}>
                {f.email}
              </a>
            </InfoRow>
          )}
        </div>
        <ProfileSection title="Additional information">
          <DetailList items={facilityAdditional(detail)} />
        </ProfileSection>
      </div>
      <aside className="profile-aside">
        {detail.sourceOwned && <SourceNote source="Master HIM 1" />}
        <History events={detail.events} />
      </aside>
    </div>
  );
}

function InfoRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <section className="info-row">
      <span className="info-icon">{icon}</span>
      <div className="info-body">
        <h2 className="info-label">{label}</h2>
        {children}
      </div>
    </section>
  );
}
