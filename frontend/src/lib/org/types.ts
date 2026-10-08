/** Staff and facility records as the ORCA API returns them to admins (/v1/org). */

export const ORG_KINDS = ["staff", "facilities"] as const;
export type OrgKind = (typeof ORG_KINDS)[number];
export const isOrgKind = (value: string): value is OrgKind => (ORG_KINDS as readonly string[]).includes(value);

export const STAFF_CATEGORIES = ["physician", "np_pa", "scribe", "administrative", "clinical_coordination", "it", "other", "unknown"] as const;
export const EMPLOYMENT_TYPES = ["w2_full_time", "w2_part_time", "contractor_1099", "per_diem", "intern", "unknown"] as const;
export const EMPLOYMENT_STATUSES = ["onboarding", "active", "on_leave", "separated", "unknown"] as const;
export const FACILITY_TYPES = ["snf", "alf", "hospital", "ltac", "irf", "other", "unknown"] as const;
export const OPERATIONAL_STATUSES = ["active", "inactive", "prospective", "unknown"] as const;

export const CATEGORY_LABELS: Record<(typeof STAFF_CATEGORIES)[number], string> = {
  physician: "Physician",
  np_pa: "NP / PA",
  scribe: "Scribe",
  administrative: "Administrative",
  clinical_coordination: "Clinical coordination",
  it: "IT",
  other: "Other",
  unknown: "Not recorded",
};

export const EMPLOYMENT_TYPE_LABELS: Record<(typeof EMPLOYMENT_TYPES)[number], string> = {
  w2_full_time: "W-2 full time",
  w2_part_time: "W-2 part time",
  contractor_1099: "1099 contractor",
  per_diem: "Per diem",
  intern: "Intern",
  unknown: "Not recorded",
};

export const EMPLOYMENT_STATUS_LABELS: Record<(typeof EMPLOYMENT_STATUSES)[number], string> = {
  onboarding: "Onboarding",
  active: "Active",
  on_leave: "On leave",
  separated: "Separated",
  unknown: "Not recorded",
};

export const FACILITY_TYPE_LABELS: Record<(typeof FACILITY_TYPES)[number], string> = {
  snf: "Skilled nursing (SNF)",
  alf: "Assisted living (ALF)",
  hospital: "Hospital",
  ltac: "Long-term acute (LTAC)",
  irf: "Inpatient rehab (IRF)",
  other: "Other",
  unknown: "Not recorded",
};

export const OPERATIONAL_STATUS_LABELS: Record<(typeof OPERATIONAL_STATUSES)[number], string> = {
  active: "Active",
  inactive: "Inactive",
  prospective: "Prospective",
  unknown: "Not recorded",
};

/** A label for a known value, or the raw value if the API sends one this app doesn't know yet. */
export function labelFor(labels: Record<string, string>, value: string | null | undefined): string {
  return value ? (labels[value] ?? value) : "—";
}

/** An employee's Access: the roles on their linked sign-in account (null = no account linked). */
export interface StaffAccess {
  personId: string;
  email: string;
  active: boolean;
  roles: string[];
}

export interface Staff {
  id: string;
  staffNumber: string;
  displayName: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  credentials: string | null;
  title: string | null;
  category: string;
  workEmail: string | null;
  personId: string | null;
  employmentType: string;
  employmentStatus: string;
  startDate: string | null;
  endDate: string | null;
  npi: string | null;
  directoryVisible: boolean;
  /** Work line (visible to all staff). */
  ringcentralPhone?: string | null;
  /** HR and ADMIN only; absent when the API withholds them. */
  personalPhone?: string | null;
  personalEmail?: string | null;
  caqhProviderId?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present for HR and admins. */
  access?: StaffAccess | null;
}

export interface Facility {
  id: string;
  facilityNumber: string;
  name: string;
  abbreviation: string | null;
  legalName: string | null;
  type: string;
  npi: string | null;
  region: string | null;
  county: string | null;
  address: { line1: string | null; line2: string | null; city: string | null; state: string | null; postalCode: string | null };
  phone: string | null;
  fax: string | null;
  email: string | null;
  operationalStatus: string;
  contract: { status: string | null; effectiveDate: string | null; endDate: string | null };
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrgEvent {
  action: string;
  fields: string[];
  actor: string;
  at: string;
}

export const ASSIGNMENT_LABELS: Record<string, string> = {
  rounding_provider: "Rounding provider",
  scribe_coverage: "Scribe coverage",
  credentialed: "Credentialed",
  liaison: "Liaison",
  other: "Other",
};

export interface StaffDetail {
  staff: Staff;
  aliases: { id: string; context: string; alias: string }[];
  assignments: { id: string; facility: { id: string; name: string }; type: string; effectiveFrom: string | null }[];
  /** Present only for people who may see facility access (ADMIN, HIM). */
  facilityAccess?: FacilityAccess[];
  sourceOwned: boolean;
  events: OrgEvent[];
}

// ── Hospital logins: provider access to facility systems (PointClickCare and others) ─────────────

/** "PointClickCare", or the other system's name. */
export const systemLabel = (a: Pick<FacilityAccess, "system" | "systemName">) => (a.system === "pcc" ? "PointClickCare" : (a.systemName ?? "Other system"));

/** Every login on a facility, whichever API version answered. */
export const facilityLogins = (d: Pick<FacilityDetail, "access">) => d.access?.logins ?? d.access?.pcc ?? [];

export const LOGIN_METHOD_LABELS: Record<string, string> = {
  ringcentral_sms: "RingCentral (text)",
  sms: "Text message",
  authenticator_app: "Authenticator app",
  email: "Email",
  none: "None",
  other: "Other",
  unknown: "Not recorded",
};

export const ACCESS_STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  active: "Active",
  disabled: "Disabled",
  expired: "Expired",
  unknown: "Not recorded",
};

/** One provider's access to one facility's system, pre-joined by the ORCA API. Never a password. */
export interface FacilityAccess {
  id: string;
  /** "pcc" = PointClickCare; "other" = another hospital system, named in systemName. */
  system: "pcc" | "other";
  systemName?: string | null;
  staff: { id: string; displayName: string; category: string };
  facility: { id: string; name: string; abbreviation: string | null };
  organization: string | null;
  username: string | null;
  loginMethod: string;
  loginMethodDetail: string | null;
  status: string;
  notes: string | null;
  hasPassword: boolean;
  passwordSetAt: string | null;
  passwordSetBy: string | null;
  /** Who last set the username or password, when, and from which app ("portal" = the provider themself, "admin" = ORCA Admin). */
  passwordSetVia?: string | null;
  usernameSetAt?: string | null;
  usernameSetBy?: string | null;
  usernameSetVia?: string | null;
  /** The provider currently has an assignment at this facility. */
  assigned: boolean;
  updatedAt: string;
  updatedBy: string;
}

/** Someone to call at a facility. The role is text: a standard one (contactRoles) or the sheet's own wording. */
export interface FacilityContact {
  id: string;
  role: string;
  name: string | null;
  title: string | null;
  phone: string | null;
  extension?: string | null;
  email: string | null;
  notes?: string | null;
  updatedAt?: string;
  updatedBy?: string | null;
}

/** What a contact form may send; the proxy routes pass only these through. */
export const CONTACT_FIELDS = ["role", "name", "title", "phone", "extension", "email", "notes"];

export type ContactInput = Partial<Record<"role" | "name" | "title" | "phone" | "extension" | "email" | "notes", string | null>>;

/** Shown when the API doesn't send its list (older API). */
export const DEFAULT_CONTACT_ROLES = ["Administrator", "DON", "ADON", "DOR", "IT / EHR", "Medical Records", "Admissions", "Business Office", "Social Services", "Unit Manager", "Medical Director"];
/** The contacts every facility should have; missing ones are suggested. */
export const KEY_CONTACT_ROLES = ["Administrator", "DON", "DOR", "IT / EHR"];

export interface FacilityDetail {
  facility: Facility;
  /** HIM, HR and admins; absent for others. */
  contacts?: FacilityContact[];
  contactRoles?: string[];
  aliases: { id: string; alias: string; type: string }[];
  assignments: { id: string; staff: { id: string; displayName: string }; type: string; effectiveFrom: string | null }[];
  /** Present only for people who may see facility access (ADMIN, HIM). */
  /** logins: every system (newer API); pcc: PointClickCare only (older API). */
  access?: { logins?: FacilityAccess[]; pcc: FacilityAccess[] };
  sourceOwned: boolean;
  events: OrgEvent[];
}

/** One field the ORCA API refused, named the way the form names it ("address.state"). */
export interface FieldError {
  field: string;
  message: string;
}
