import { ROLE_OPTIONS } from "@/lib/access";
import { formatDate } from "@/lib/format";
import { PROVIDER_CATEGORIES } from "@/lib/schedule/board";
import {
  CATEGORY_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  FACILITY_TYPE_LABELS,
  OPERATIONAL_STATUS_LABELS,
  type Facility,
  type FacilityDetail,
  type Staff,
} from "./types";

/**
 * What the read-only Employee and Facility profiles show, worked out from the canonical record.
 * Empty and "unknown" values are left out rather than shown as "Not recorded" or "—", so the
 * information that exists isn't buried. Pure: no React, unit tested.
 */

export interface DetailItem {
  label: string;
  value: string;
  href?: string;
}

const present = (value: string | null | undefined): value is string => typeof value === "string" && value.trim() !== "";
/** A label for an enum value, or null when it's unknown/unset (so it can be hidden). */
const known = (labels: Record<string, string>, value: string | null | undefined) => (value && value !== "unknown" ? (labels[value] ?? value) : null);

function items(list: (DetailItem | null | false)[]): DetailItem[] {
  return list.filter((i): i is DetailItem => !!i && present(i.value));
}

/** "Ann Example, NP" → "AE"; "Bo Q. Sample" → "BS"; one word → first two letters. */
export function initials(name: string): string {
  const base = name.split(",")[0]!.trim();
  const words = base.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.replace(/[^\p{L}]/gu, "").slice(0, 2).toUpperCase();
  const first = words[0]!.match(/\p{L}/u)![0];
  const last = words.at(-1)!.match(/\p{L}/u)![0];
  return (first + last).toUpperCase();
}

// ── Employees ───────────────────────────────────────────

export const isFormer = (s: Pick<Staff, "employmentStatus">) => s.employmentStatus === "separated";

/** Providers who can appear on the schedule (same rule as the schedule board). */
export const isSchedulable = (s: Pick<Staff, "category">) => PROVIDER_CATEGORIES.includes(s.category);

/**
 * The secondary line under a name in the directory and profile header: the job title, else the
 * credentials — unless the display name already ends with them ("Ann Example, NP").
 */
export function staffSubtitle(s: Pick<Staff, "title" | "credentials" | "displayName">): string | null {
  if (present(s.title)) return s.title;
  if (!present(s.credentials)) return null;
  return s.displayName.toLowerCase().includes(s.credentials.trim().toLowerCase()) ? null : s.credentials;
}

/** The kind of job (Physician, NP / PA…), shown as Position. */
export function staffPosition(s: Pick<Staff, "category">): string | null {
  return known(CATEGORY_LABELS, s.category);
}

/** The employee's Category: their roles, labelled, in the order roles are listed. Empty when none or no account. */
export function staffCategoryLabels(s: Pick<Staff, "access">): string[] {
  const held = s.access?.roles ?? [];
  return ROLE_OPTIONS.filter((r) => held.includes(r.key)).map((r) => r.label);
}

export function staffStatus(s: Pick<Staff, "employmentStatus">): string | null {
  return known(EMPLOYMENT_STATUS_LABELS, s.employmentStatus);
}

/** Frequently needed facts. End date only once someone has left (or one is recorded). */
export function staffOverview(s: Staff): DetailItem[] {
  return items([
    present(s.workEmail) && { label: "Work email", value: s.workEmail, href: `mailto:${s.workEmail}` },
    { label: "Job title", value: s.title ?? "" },
    { label: "Position", value: staffPosition(s) ?? "" },
    { label: "Employment type", value: known(EMPLOYMENT_TYPE_LABELS, s.employmentType) ?? "" },
    { label: "Status", value: staffStatus(s) ?? "" },
    present(s.startDate) && { label: "Start date", value: formatDate(s.startDate) },
    present(s.endDate) && { label: "End date", value: formatDate(s.endDate) },
  ]);
}

/** Less frequently needed details. Always includes the staff number, so the section is never empty. */
export function staffAdditional(s: Staff): DetailItem[] {
  return items([
    { label: "Credentials", value: s.credentials ?? "" },
    { label: "NPI", value: s.npi ?? "" },
    { label: "Preferred name", value: s.preferredName ?? "" },
    { label: "Middle name", value: s.middleName ?? "" },
    { label: "Staff number", value: s.staffNumber },
    !s.directoryVisible && { label: "Staff directory", value: "Hidden (still visible to HR and admins)" },
  ]);
}

// ── Facilities ──────────────────────────────────────────

export function facilityType(f: Pick<Facility, "type">): string | null {
  return known(FACILITY_TYPE_LABELS, f.type);
}

export function facilityStatus(f: Pick<Facility, "operationalStatus" | "archivedAt">): string | null {
  return f.archivedAt ? "Archived" : known(OPERATIONAL_STATUS_LABELS, f.operationalStatus);
}

/** Address as display lines; [] when nothing is recorded. */
export function addressLines(a: Facility["address"]): string[] {
  const cityLine = [a.city, [a.state, a.postalCode].filter(present).join(" ")].filter(present).join(", ");
  return [a.line1, a.line2, cityLine].filter(present);
}

export function facilityContact(f: Facility): DetailItem[] {
  return items([
    present(f.phone) && { label: "Phone", value: f.phone, href: `tel:${f.phone.replace(/[^\d+]/g, "")}` },
    { label: "Fax", value: f.fax ?? "" },
    present(f.email) && { label: "Email", value: f.email, href: `mailto:${f.email}` },
  ]);
}

/** Less frequently needed details. Always includes the facility number. */
export function facilityAdditional(detail: Pick<FacilityDetail, "facility" | "aliases">): DetailItem[] {
  const f = detail.facility;
  const otherNames = detail.aliases.filter((a) => a.type !== "canonical_name" && a.type !== "abbreviation").map((a) => a.alias);
  const contractDates = [f.contract.effectiveDate && `from ${formatDate(f.contract.effectiveDate)}`, f.contract.endDate && `to ${formatDate(f.contract.endDate)}`]
    .filter(Boolean)
    .join(" ");
  return items([
    { label: "Legal name", value: f.legalName ?? "" },
    { label: "NPI", value: f.npi ?? "" },
    { label: "ORCA region", value: f.region ?? "" },
    { label: "Contract", value: [f.contract.status, contractDates].filter(present).join(" · ") },
    { label: "Also known as", value: otherNames.join(", ") },
    { label: "Facility number", value: f.facilityNumber },
  ]);
}
