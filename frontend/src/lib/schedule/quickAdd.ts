import type { SearchOption } from "./search";
import type { AssignmentInput, AssignmentType, TimeBlock } from "./types";

/**
 * Quick add: the cell already says the date and either the provider (provider view) or the
 * facility (facility view), so the only question is the other one. Everything else has the
 * full form's defaults unless "More options" changes it.
 */

/** The clicked cell. Exactly one of staffId / facilityId is set. */
export interface QuickContext {
  date: string;
  staffId?: string;
  facilityId?: string;
}

/** What "More options" can change. The defaults make a normal all-day facility entry. */
export interface QuickChoices {
  /** Types that sit at the cell's facility, or at the facility picked. */
  type: Extract<AssignmentType, "facility" | "coverage" | "admin" | "clinic">;
  timeBlock: TimeBlock;
  startTime: string;
  endTime: string;
  coveringStaffId: string | null;
  notes: string;
}

export const DEFAULT_CHOICES: QuickChoices = { type: "facility", timeBlock: "all_day", startTime: "09:00", endTime: "17:00", coveringStaffId: null, notes: "" };

export type QuickInput = { ok: true; input: AssignmentInput } | { ok: false; message: string };

/** The create request for a quick add. The API validates it again and checks for clashes. */
export function buildQuickInput(context: QuickContext, pick: Pick<SearchOption, "kind" | "id">, choices: QuickChoices): QuickInput {
  const custom = choices.timeBlock === "custom";
  if (custom && !(choices.startTime && choices.endTime && choices.endTime > choices.startTime)) {
    return { ok: false, message: "The end time must be after the start time." };
  }
  const time = { timeBlock: choices.timeBlock, startTime: custom ? choices.startTime : null, endTime: custom ? choices.endTime : null };
  const notes = choices.notes.trim() || null;

  if (context.facilityId) {
    if (pick.kind !== "staff") return { ok: false, message: "Choose a provider." };
    return {
      ok: true,
      input: {
        staffId: pick.id,
        date: context.date,
        type: choices.type,
        facilityId: context.facilityId,
        coveringStaffId: choices.type === "coverage" ? choices.coveringStaffId : null,
        ...time,
        notes,
      },
    };
  }

  if (!context.staffId) return { ok: false, message: "Choose a provider." };
  if (pick.kind === "special") {
    return {
      ok: true,
      input: { staffId: context.staffId, date: context.date, type: pick.id as AssignmentType, facilityId: null, coveringStaffId: null, ...time, notes },
    };
  }
  if (pick.kind !== "facility") return { ok: false, message: "Choose a facility." };
  return {
    ok: true,
    input: {
      staffId: context.staffId,
      date: context.date,
      type: choices.type,
      facilityId: pick.id,
      coveringStaffId: choices.type === "coverage" ? choices.coveringStaffId : null,
      ...time,
      notes,
    },
  };
}
