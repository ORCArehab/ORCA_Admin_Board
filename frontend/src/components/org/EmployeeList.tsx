"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/DataTable";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { listStaff } from "@/lib/org/api";
import { CATEGORY_LABELS, EMPLOYMENT_STATUS_LABELS, labelFor, STAFF_CATEGORIES, type Staff } from "@/lib/org/types";
import { useOrgResource } from "@/lib/org/useOrgResource";

type StatusFilter = "current" | "former" | "all";

const employeeHref = (s: Staff) => `/employees/${s.id}`;

/** Everyone in the organization records, searchable; each row opens the editor. */
export function EmployeeList() {
  const state = useOrgResource(listStaff, []);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("current");
  const [category, setCategory] = useState("");

  const all = useMemo(() => (state.status === "ready" ? state.data : []), [state]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (s) =>
        (status === "all" || (status === "former") === (s.employmentStatus === "separated")) &&
        (!category || s.category === category) &&
        (!q || [s.displayName, s.workEmail, s.title, s.staffNumber, s.npi].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [all, query, status, category]);

  const columns: Column<Staff>[] = [
    {
      key: "name",
      header: "Name",
      render: (s) => (
        <>
          <Link className="table-link" href={employeeHref(s)}>
            {s.displayName}
          </Link>
          {!s.directoryVisible && <span className="tag">Hidden</span>}
        </>
      ),
    },
    { key: "title", header: "Title", render: (s) => s.title ?? <span className="muted">—</span> },
    { key: "category", header: "Category", render: (s) => labelFor(CATEGORY_LABELS, s.category) },
    { key: "status", header: "Status", render: (s) => <span className={`status status-${s.employmentStatus}`}>{labelFor(EMPLOYMENT_STATUS_LABELS, s.employmentStatus)}</span> },
    { key: "email", header: "Work email", render: (s) => s.workEmail ?? <span className="muted">—</span> },
    { key: "number", header: "Staff #", render: (s) => <span className="muted num">{s.staffNumber}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Employees"
        description="Staff records shared by every ORCA app. Changes here show up in the portal, NOVA and the schedule."
        aside={
          <Link className="button button-primary-sm" href="/employees/new">
            + New employee
          </Link>
        }
      />
      {state.status === "loading" && <LoadingState />}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" && (
        <>
          <div className="table-toolbar">
            <div className="schedule-filters">
              <input className="search" type="search" placeholder="Search name, email, title, NPI" aria-label="Search employees" value={query} onChange={(e) => setQuery(e.target.value)} />
              <select className="select" aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {STAFF_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
              <div className="segmented" role="group" aria-label="Status">
                {(["current", "former", "all"] as const).map((s) => (
                  <button key={s} type="button" className="segment" aria-pressed={status === s} onClick={() => setStatus(s)}>
                    {s === "current" ? "Current" : s === "former" ? "Former" : "All"}
                  </button>
                ))}
              </div>
            </div>
            <span className="table-count">{rows.length === all.length ? `${all.length} employees` : `${rows.length} of ${all.length} employees`}</span>
          </div>
          <DataTable caption="Employees" columns={columns} rows={rows} rowKey={(s) => s.id} rowHref={employeeHref} emptyMessage="No employees match these filters." />
        </>
      )}
    </>
  );
}
