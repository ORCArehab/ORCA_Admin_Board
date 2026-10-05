import type { SectionDef } from "./form";
import {
  CATEGORY_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  FACILITY_TYPE_LABELS,
  OPERATIONAL_STATUS_LABELS,
} from "./types";

/** The employee form. The ORCA API validates every field again. */
export function staffSections(isNew: boolean): SectionDef[] {
  return [
    {
      title: "Name",
      fields: [
        { name: "firstName", label: "First name", required: true, autoComplete: "off" },
        { name: "lastName", label: "Last name", required: true, autoComplete: "off" },
        { name: "middleName", label: "Middle name", autoComplete: "off" },
        { name: "preferredName", label: "Preferred name", autoComplete: "off" },
        { name: "credentials", label: "Credentials", placeholder: "MD, DO, NP, PA-C", hint: "For display. Licenses are tracked separately." },
        {
          name: "displayName",
          label: "Display name",
          hint: isNew ? "Leave blank to use “First Last, Credentials”." : "Follows the name and credentials unless it has been changed by hand.",
        },
      ],
    },
    {
      title: "Role",
      fields: [
        { name: "title", label: "Job title" },
        { name: "category", label: "Category", kind: "select", options: CATEGORY_LABELS },
        { name: "workEmail", label: "Work email", kind: "email", hint: "Their ORCA email. Lowercased when saved.", autoComplete: "off" },
        { name: "npi", label: "NPI", placeholder: "10 digits", hint: "Providers only. Checked for a valid check digit." },
      ],
    },
    {
      title: "Employment",
      fields: [
        { name: "employmentStatus", label: "Status", kind: "select", options: EMPLOYMENT_STATUS_LABELS },
        { name: "employmentType", label: "Type", kind: "select", options: EMPLOYMENT_TYPE_LABELS },
        { name: "startDate", label: "Start date", kind: "date" },
        { name: "endDate", label: "End date", kind: "date" },
        { name: "directoryVisible", label: "Show in the staff directory", kind: "checkbox", wide: true, hint: "Hidden people are still visible to HR and admins." },
      ],
    },
  ];
}

export const STAFF_DEFAULTS = { category: "unknown", employmentType: "unknown", employmentStatus: "onboarding", directoryVisible: true };

/** The facility form. Archiving appears only once a facility exists. */
export function facilitySections(isNew: boolean): SectionDef[] {
  return [
    {
      title: "Facility",
      fields: [
        { name: "name", label: "Name", required: true, wide: true, autoComplete: "off" },
        { name: "abbreviation", label: "Abbreviation", placeholder: "e.g. CCRC", hint: "Must be unique. Used on the schedule." },
        { name: "type", label: "Type", kind: "select", options: FACILITY_TYPE_LABELS },
        { name: "legalName", label: "Legal name (LLC)" },
        { name: "npi", label: "NPI", placeholder: "10 digits" },
        {
          name: "operationalStatus",
          label: "Operational status",
          kind: "select",
          options: OPERATIONAL_STATUS_LABELS,
          hint: "Whether ORCA currently serves this facility. Set deliberately, not from the contract.",
        },
        { name: "region", label: "ORCA region", placeholder: "e.g. San Diego" },
      ],
    },
    {
      title: "Location",
      fields: [
        { name: "address.line1", label: "Street address", wide: true, autoComplete: "off" },
        { name: "address.line2", label: "Suite / unit", wide: true, autoComplete: "off" },
        { name: "address.city", label: "City" },
        { name: "address.state", label: "State", placeholder: "CA" },
        { name: "address.postalCode", label: "ZIP code" },
        { name: "county", label: "County" },
      ],
    },
    {
      title: "Contact",
      fields: [
        { name: "phone", label: "Phone", autoComplete: "off" },
        { name: "fax", label: "Fax", autoComplete: "off" },
        { name: "email", label: "Email", kind: "email", wide: true, autoComplete: "off" },
      ],
    },
    {
      title: "Contract",
      fields: [
        { name: "contract.status", label: "Contract status", wide: true, placeholder: "e.g. Active, Pending, Terminated" },
        { name: "contract.effectiveDate", label: "Start", kind: "date" },
        { name: "contract.endDate", label: "End", kind: "date" },
        ...(isNew
          ? []
          : [
              {
                name: "archived",
                label: "Archived",
                kind: "checkbox" as const,
                wide: true,
                hint: "For a mistaken or duplicate record. It disappears from pickers but nothing is deleted. A facility ORCA no longer serves should be Inactive instead.",
              },
            ]),
      ],
    },
  ];
}

export const FACILITY_DEFAULTS = { type: "unknown", operationalStatus: "active", "address.state": "CA" };
