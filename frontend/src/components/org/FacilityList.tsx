"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { listFacilities } from "@/lib/org/api";
import { facilityStatus, facilityType } from "@/lib/org/profile";
import { OPERATIONAL_STATUS_LABELS, OPERATIONAL_STATUSES, type Facility } from "@/lib/org/types";
import { useOrgResource } from "@/lib/org/useOrgResource";

/** Finding a facility: abbreviation, name, city and type. Each row opens the profile. */
export function FacilityList() {
  const state = useOrgResource(listFacilities, []);
  const [query, setQuery] = useState("");
  // "" = every facility that isn't archived.
  const [status, setStatus] = useState("");

  const all = useMemo(() => (state.status === "ready" ? state.data : []), [state]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (f) =>
        (status === "archived" ? f.archivedAt !== null : f.archivedAt === null && (!status || f.operationalStatus === status)) &&
        (!q || [f.name, f.abbreviation, f.legalName, f.address.city, f.region, f.facilityNumber, f.npi].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [all, query, status]);

  const archived = all.filter((f) => f.archivedAt !== null).length;
  return (
    <>
      <PageHeader
        title="Facilities"
        description="Facility records shared by every ORCA app."
        aside={
          <Link className="button button-primary-sm" href="/facilities/new">
            + New facility
          </Link>
        }
      />
      {state.status === "loading" && <LoadingState />}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" && (
        <>
          <div className="directory-toolbar">
            <input className="search" type="search" placeholder="Search name, abbreviation, city" aria-label="Search facilities" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {OPERATIONAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {OPERATIONAL_STATUS_LABELS[s]}
                </option>
              ))}
              {archived > 0 && <option value="archived">Archived ({archived})</option>}
            </select>
            <span className="table-count">{`${rows.length} ${rows.length === 1 ? "facility" : "facilities"}`}</span>
          </div>
          {rows.length === 0 ? (
            <p className="directory-empty">No facilities match these filters.</p>
          ) : (
            <ul className="directory" aria-label="Facilities">
              {rows.map((f) => (
                <FacilityRow key={f.id} facility={f} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

export function FacilityRow({ facility: f }: { facility: Facility }) {
  // Only call out a status worth noticing; active is the normal case.
  const status = f.archivedAt || f.operationalStatus !== "active" ? facilityStatus(f) : null;
  return (
    <li>
      <Link className={`directory-row${f.archivedAt || f.operationalStatus === "inactive" ? " is-former" : ""}`} href={`/facilities/${f.id}`}>
        <span className="facility-badge">{f.abbreviation ?? "—"}</span>
        <span className="directory-main">
          <span className="directory-name">{f.name}</span>
          {f.address.city && <span className="directory-sub">{f.address.city}</span>}
        </span>
        <span className="directory-col">{facilityType(f) ?? ""}</span>
        <span className="directory-state">{status && <span className="state-note">{status}</span>}</span>
        <span className="directory-chevron" aria-hidden="true">›</span>
      </Link>
    </li>
  );
}
