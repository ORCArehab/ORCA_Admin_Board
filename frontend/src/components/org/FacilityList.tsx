"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/DataTable";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { listFacilities } from "@/lib/org/api";
import { FACILITY_TYPE_LABELS, labelFor, OPERATIONAL_STATUS_LABELS, OPERATIONAL_STATUSES, type Facility } from "@/lib/org/types";
import { useOrgResource } from "@/lib/org/useOrgResource";

const facilityHref = (f: Facility) => `/facilities/${f.id}`;

/** Every facility in the organization records, searchable; each row opens the editor. */
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

  const columns: Column<Facility>[] = [
    {
      key: "name",
      header: "Facility",
      render: (f) => (
        <Link className="table-link" href={facilityHref(f)}>
          {f.abbreviation && <span className="abbr">{f.abbreviation}</span>}
          {f.name}
        </Link>
      ),
    },
    { key: "type", header: "Type", render: (f) => labelFor(FACILITY_TYPE_LABELS, f.type) },
    { key: "status", header: "Status", render: (f) => <span className={`status status-${f.operationalStatus}`}>{labelFor(OPERATIONAL_STATUS_LABELS, f.operationalStatus)}</span> },
    { key: "city", header: "City", render: (f) => f.address.city ?? <span className="muted">—</span> },
    { key: "region", header: "Region", render: (f) => f.region ?? <span className="muted">—</span> },
    { key: "phone", header: "Phone", render: (f) => f.phone ?? <span className="muted">—</span> },
    { key: "number", header: "Facility #", render: (f) => <span className="muted num">{f.facilityNumber}</span> },
  ];

  const archived = all.filter((f) => f.archivedAt !== null).length;
  return (
    <>
      <PageHeader
        title="Facilities"
        description="Facility records shared by every ORCA app. Changes here show up in the portal, NOVA and the schedule."
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
          <div className="table-toolbar">
            <div className="schedule-filters">
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
            </div>
            <span className="table-count">{`${rows.length} ${rows.length === 1 ? "facility" : "facilities"}`}</span>
          </div>
          <DataTable caption="Facilities" columns={columns} rows={rows} rowKey={(f) => f.id} rowHref={facilityHref} emptyMessage="No facilities match these filters." />
        </>
      )}
    </>
  );
}
