/**
 * Contract of this app's /api/schedule/* routes, which pass through the ORCA API's
 * /v1/schedule and /v1/org data (ORCA_Backend_API src/routes/schedule.ts). Rows reference
 * staff and facilities by id; names always come from those canonical records.
 */

export const ASSIGNMENT_TYPES = ["facility", "coverage", "admin", "clinic", "pto", "off"] as const;
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

export const TIME_BLOCKS = ["am", "pm", "all_day", "custom"] as const;
export type TimeBlock = (typeof TIME_BLOCKS)[number];

export interface Assignment {
  id: string;
  staffId: string;
  /** YYYY-MM-DD */
  date: string;
  type: AssignmentType;
  facilityId: string | null;
  coveringStaffId: string | null;
  timeBlock: TimeBlock;
  /** HH:MM, custom times only. */
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  source?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface StaffRecord {
  id: string;
  displayName: string;
  credentials: string | null;
  category: string;
  employmentStatus?: string;
  /** For search only: other names this person goes by. */
  firstName?: string;
  lastName?: string;
  preferredName?: string | null;
  aliases?: string[];
}

export interface FacilityRecord {
  id: string;
  name: string;
  abbreviation: string | null;
  operationalStatus: string;
  city?: string | null;
  /** For search only: legal, former, common and tracker names. */
  aliases?: string[];
}

/** GET /api/schedule/board: one week's entries plus the roster and facility list for rows and pickers. */
export interface ScheduleBoardData {
  from: string;
  to: string;
  assignments: Assignment[];
  /** Current (non-separated) staff, plus anyone this week's entries refer to. */
  staff: StaffRecord[];
  /** Facilities that aren't archived, plus any this week's entries refer to. */
  facilities: FacilityRecord[];
}

export interface Issue {
  code: string;
  message: string;
  assignmentId?: string;
}

/** What the editor sends. */
export interface AssignmentInput {
  staffId: string;
  date: string;
  type: AssignmentType;
  facilityId: string | null;
  coveringStaffId: string | null;
  timeBlock: TimeBlock;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  confirmWarnings?: boolean;
}
