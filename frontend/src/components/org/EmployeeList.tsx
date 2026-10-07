"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { listStaff } from "@/lib/org/api";
import { ROLE_OPTIONS } from "@/lib/access";
import { isFormer, staffCategoryLabels, staffPosition, staffSubtitle } from "@/lib/org/profile";
import { CATEGORY_LABELS, STAFF_CATEGORIES, type Staff } from "@/lib/org/types";
import { useOrgResource } from "@/lib/org/useOrgResource";
import { Avatar } from "./ProfileParts";

type StatusFilter = "current" | "former" | "all";

/** Finding a person, not reading their record: name, title, position, Category and current/former. Each row opens the profile. */
export function EmployeeList() {
  const state = useOrgResource(listStaff, []);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("current");
  const [position, setPosition] = useState("");
  /** A role key, "none" (no roles or no account), or "" for everyone. */
  const [role, setRole] = useState("");

  const all = useMemo(() => (state.status === "ready" ? state.data : []), [state]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (s) =>
        (status === "all" || (status === "former") === isFormer(s)) &&
        (!position || s.category === position) &&
        (!role || (role === "none" ? !s.access?.roles.length : !!s.access?.roles.includes(role))) &&
        (!q || [s.displayName, s.preferredName, s.workEmail, s.title, s.staffNumber, s.npi].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [all, query, status, position, role]);

  return (
    <>
      <PageHeader
        title="Employees"
        description="Staff records shared by every ORCA app."
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
          <div className="directory-toolbar">
            <input className="search" type="search" placeholder="Search name, email, title, NPI" aria-label="Search employees" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="select" aria-label="Position" value={position} onChange={(e) => setPosition(e.target.value)}>
              <option value="">All positions</option>
              {STAFF_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <select className="select" aria-label="Category" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">All categories</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
              <option value="none">No category</option>
            </select>
            <div className="segmented" role="group" aria-label="Status">
              {(["current", "former", "all"] as const).map((s) => (
                <button key={s} type="button" className="segment" aria-pressed={status === s} onClick={() => setStatus(s)}>
                  {s === "current" ? "Current" : s === "former" ? "Former" : "All"}
                </button>
              ))}
            </div>
            <span className="table-count">{rows.length === all.length ? `${all.length} employees` : `${rows.length} of ${all.length}`}</span>
          </div>
          {rows.length === 0 ? (
            <p className="directory-empty">No employees match these filters.</p>
          ) : (
            <ul className="directory" aria-label="Employees">
              {rows.map((s) => (
                <EmployeeRow key={s.id} staff={s} showState={status !== "current"} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

export function EmployeeRow({ staff: s, showState }: { staff: Staff; showState: boolean }) {
  const subtitle = staffSubtitle(s);
  const former = isFormer(s);
  return (
    <li>
      <Link className={`directory-row${former ? " is-former" : ""}`} href={`/employees/${s.id}`}>
        <Avatar name={s.displayName} />
        <span className="directory-main">
          <span className="directory-name">{s.displayName}</span>
          {subtitle && <span className="directory-sub">{subtitle}</span>}
        </span>
        <span className="directory-col">{[staffPosition(s), staffCategoryLabels(s).join(", ")].filter(Boolean).join(" · ")}</span>
        <span className="directory-state">
          {showState && <span className={former ? "state-former" : "state-current"}>{former ? "Former" : "Current"}</span>}
          {s.employmentStatus === "onboarding" && <span className="state-note">Onboarding</span>}
          {s.employmentStatus === "on_leave" && <span className="state-note">On leave</span>}
        </span>
        <span className="directory-chevron" aria-hidden="true">›</span>
      </Link>
    </li>
  );
}
