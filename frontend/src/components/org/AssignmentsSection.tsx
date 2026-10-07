"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRoles } from "@/components/RolesProvider";
import { assignmentTypesFor } from "@/lib/access";
import { formatDate } from "@/lib/format";
import { createAssignment, endAssignment, listFacilities, listStaff, OrgError } from "@/lib/org/api";
import { isFormer } from "@/lib/org/profile";
import { ASSIGNMENT_LABELS, labelFor } from "@/lib/org/types";
import { today } from "@/lib/schedule/week";
import { ProfileSection } from "./ProfileParts";

/** One current assignment, seen from the employee (other = facility) or the facility (other = employee). */
export interface AssignmentRow {
  id: string;
  type: string;
  effectiveFrom: string | null;
  other: { id: string; label: string; href?: string };
}

/**
 * Facility assignments on an employee or facility profile: who covers which facility. Anyone who
 * may write a type sees "+ Assign" and End for it (coverage is HIM's, staffing HR's; admins both).
 * Ending keeps the assignment as history in the ORCA API.
 */
export function AssignmentsSection({
  side,
  ownerId,
  title,
  rows,
  empty,
  action,
  onChanged,
}: {
  side: "employee" | "facility";
  ownerId: string;
  title: string;
  rows: AssignmentRow[];
  empty: string;
  action?: React.ReactNode;
  onChanged: (message: string) => void;
}) {
  const writable = assignmentTypesFor(useRoles());
  const [adding, setAdding] = useState(false);
  const addLabel = side === "facility" ? "+ Assign staff" : "+ Assign facility";

  return (
    <ProfileSection
      title={title}
      action={
        <span className="profile-section-actions">
          {action}
          {writable.length > 0 && !adding && (
            <button type="button" className="button" onClick={() => setAdding(true)}>
              {addLabel}
            </button>
          )}
        </span>
      }
    >
      {adding && (
        <AssignForm
          side={side}
          ownerId={ownerId}
          types={writable}
          onCancel={() => setAdding(false)}
          onSaved={(message) => {
            setAdding(false);
            onChanged(message);
          }}
        />
      )}
      {rows.length === 0 ? (
        <p className="profile-empty">{empty}</p>
      ) : (
        <ul className="assignment-rows">
          {rows.map((row) => (
            <AssignmentItem key={row.id} row={row} canEnd={writable.includes(row.type)} onEnded={onChanged} />
          ))}
        </ul>
      )}
    </ProfileSection>
  );
}

function AssignmentItem({ row, canEnd, onEnded }: { row: AssignmentRow; canEnd: boolean; onEnded: (message: string) => void }) {
  const [ending, setEnding] = useState(false);
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detail = [labelFor(ASSIGNMENT_LABELS, row.type), row.effectiveFrom && `since ${formatDate(row.effectiveFrom)}`].filter(Boolean).join(" · ");

  async function end(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await endAssignment(row.id, date);
      onEnded(`Assignment ended: ${row.other.label}.`);
    } catch (err) {
      setError(err instanceof OrgError ? err.message : "The assignment couldn't be ended.");
      setBusy(false);
    }
  }

  return (
    <li className="assignment-row">
      <div className="assignment-main">
        {row.other.href ? (
          <Link className="link-rows-label assignment-link" href={row.other.href}>
            {row.other.label}
          </Link>
        ) : (
          <span className="link-rows-label">{row.other.label}</span>
        )}
        <span className="link-rows-detail">{detail}</span>
      </div>
      {canEnd && !ending && (
        <button type="button" className="button button-quiet" onClick={() => setEnding(true)}>
          End
        </button>
      )}
      {ending && (
        <form className="assignment-end" onSubmit={end}>
          <label htmlFor={`end-${row.id}`}>Last day</label>
          <input id={`end-${row.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required disabled={busy} />
          <button type="button" className="button" onClick={() => { setEnding(false); setError(null); }} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="button button-primary-sm" disabled={busy || !date}>
            {busy ? "Ending…" : "End assignment"}
          </button>
          {error && <span className="record-error" role="alert">{error}</span>}
        </form>
      )}
    </li>
  );
}

type Option = { id: string; label: string };

function AssignForm({
  side,
  ownerId,
  types,
  onCancel,
  onSaved,
}: {
  side: "employee" | "facility";
  ownerId: string;
  types: string[];
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const [options, setOptions] = useState<Option[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [otherId, setOtherId] = useState("");
  const [type, setType] = useState(types[0] ?? "");
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = side === "facility" ? "employee" : "facility";

  useEffect(() => {
    let live = true;
    const load: Promise<Option[]> =
      side === "facility"
        ? listStaff().then((staff) => staff.filter((s) => !isFormer(s)).map((s) => ({ id: s.id, label: s.displayName })))
        : listFacilities().then((facilities) => facilities.filter((f) => !f.archivedAt).map((f) => ({ id: f.id, label: f.abbreviation ? `${f.name} (${f.abbreviation})` : f.name })));
    load
      .then((list) => live && setOptions(list.sort((a, b) => a.label.localeCompare(b.label))))
      .catch(() => live && setLoadError(`The ${pick} list couldn't be loaded.`));
    return () => {
      live = false;
    };
  }, [side, pick]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!otherId) {
      setError(`Choose ${side === "facility" ? "an employee" : "a facility"}.`);
      return;
    }
    setBusy(true);
    setError(null);
    const [staffId, facilityId] = side === "facility" ? [otherId, ownerId] : [ownerId, otherId];
    try {
      await createAssignment({ staffId, facilityId, type, ...(from ? { effectiveFrom: from } : {}) });
      onSaved(`Assigned: ${options?.find((o) => o.id === otherId)?.label ?? ""}, ${labelFor(ASSIGNMENT_LABELS, type).toLowerCase()}.`);
    } catch (err) {
      setError(
        err instanceof OrgError && err.status === 409
          ? `They already have a current ${labelFor(ASSIGNMENT_LABELS, type).toLowerCase()} assignment here.`
          : err instanceof OrgError
            ? err.message
            : "The assignment couldn't be saved.",
      );
      setBusy(false);
    }
  }

  return (
    <form className="assignment-form" onSubmit={submit} noValidate>
      <div className="assignment-form-grid">
        <div className="field">
          <label htmlFor="assign-other">{side === "facility" ? "Employee" : "Facility"}</label>
          <select id="assign-other" className="select" value={otherId} onChange={(e) => setOtherId(e.target.value)} disabled={busy || !options}>
            <option value="">{options ? `Choose ${side === "facility" ? "an employee" : "a facility"}` : loadError ?? "Loading…"}</option>
            {options?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="assign-type">Assignment</label>
          <select id="assign-type" className="select" value={type} onChange={(e) => setType(e.target.value)} disabled={busy}>
            {types.map((t) => (
              <option key={t} value={t}>
                {labelFor(ASSIGNMENT_LABELS, t)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="assign-from">Start date (optional)</label>
          <input id="assign-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={busy} />
        </div>
      </div>
      {error && (
        <span className="record-error" role="alert">
          {error}
        </span>
      )}
      <div className="category-actions">
        <button type="button" className="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="button button-primary-sm" disabled={busy || !options}>
          {busy ? "Saving…" : "Assign"}
        </button>
      </div>
    </form>
  );
}
