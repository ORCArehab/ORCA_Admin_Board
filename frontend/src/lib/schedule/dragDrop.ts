import { TYPE_LABELS } from "./format";
import type { Assignment, AssignmentInput } from "./types";

/**
 * Drag and drop on the board. Dropping a chip on another cell MOVES the entry there; holding
 * Alt/Option COPIES it. The target cell decides the date and either the provider (provider
 * view) or the facility (facility view; null is the "Not at a facility" row). The API checks
 * clashes exactly as it does for the editor.
 */

export interface DropTarget {
  date: string;
  staffId?: string;
  /** Facility view only. null: the "Not at a facility" row. */
  facilityId?: string | null;
}

export type DropPlan =
  | { kind: "none" }
  | { kind: "invalid"; message: string }
  | { kind: "change"; changes: Partial<Pick<AssignmentInput, "date" | "staffId" | "facilityId">> };

const NEEDS_FACILITY = new Set(["facility", "coverage"]);
const NEVER_AT_FACILITY = new Set(["pto", "off"]);

/** What dropping `entry` on `target` would change, or why it can't go there. */
export function planDrop(entry: Assignment, target: DropTarget): DropPlan {
  const changes: Partial<Pick<AssignmentInput, "date" | "staffId" | "facilityId">> = {};
  if (target.date !== entry.date) changes.date = target.date;
  if (target.staffId !== undefined && target.staffId !== entry.staffId) changes.staffId = target.staffId;
  if (target.facilityId !== undefined && target.facilityId !== entry.facilityId) {
    if (target.facilityId === null && NEEDS_FACILITY.has(entry.type)) {
      return { kind: "invalid", message: `${TYPE_LABELS[entry.type]} entries need a facility.` };
    }
    if (target.facilityId !== null && NEVER_AT_FACILITY.has(entry.type)) {
      return { kind: "invalid", message: `${TYPE_LABELS[entry.type]} isn't at a facility. Drop it on “Not at a facility”, or switch to the provider view.` };
    }
    changes.facilityId = target.facilityId;
  }
  return Object.keys(changes).length === 0 ? { kind: "none" } : { kind: "change", changes };
}

/** The create request for a copy: the same entry with the target's date, provider or facility. */
export function copyInput(entry: Assignment, changes: Partial<AssignmentInput>): AssignmentInput {
  return {
    staffId: entry.staffId,
    date: entry.date,
    type: entry.type,
    facilityId: entry.facilityId,
    coveringStaffId: entry.coveringStaffId,
    timeBlock: entry.timeBlock,
    startTime: entry.startTime,
    endTime: entry.endTime,
    notes: entry.notes,
    ...changes,
  };
}
