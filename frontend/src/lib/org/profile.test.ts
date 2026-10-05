import { describe, expect, it } from "vitest";
import { addressLines, facilityAdditional, facilityContact, facilityStatus, initials, isSchedulable, staffAdditional, staffOverview, staffSubtitle } from "./profile";
import type { Facility, Staff } from "./types";

const staff = (overrides: Partial<Staff> = {}): Staff => ({
  id: "s1",
  staffNumber: "S-0001",
  displayName: "Ann Example, NP",
  firstName: "Ann",
  middleName: null,
  lastName: "Example",
  preferredName: null,
  credentials: "NP",
  title: null,
  category: "np_pa",
  workEmail: null,
  personId: null,
  employmentType: "unknown",
  employmentStatus: "active",
  startDate: null,
  endDate: null,
  npi: null,
  directoryVisible: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

const facility = (overrides: Partial<Facility> = {}): Facility => ({
  id: "f1",
  facilityNumber: "F-0001",
  name: "Example Care Center",
  abbreviation: "ECC",
  legalName: null,
  type: "snf",
  npi: null,
  region: null,
  county: null,
  address: { line1: null, line2: null, city: null, state: null, postalCode: null },
  phone: null,
  fax: null,
  email: null,
  operationalStatus: "active",
  contract: { status: null, effectiveDate: null, endDate: null },
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("initials", () => {
  it("uses first and last name, ignoring credentials", () => {
    expect(initials("Ann Example, NP")).toBe("AE");
    expect(initials("Dr. Bo Q. Sample")).toBe("DS");
    expect(initials("Cy")).toBe("CY");
    expect(initials("")).toBe("?");
  });
});

describe("employee profile", () => {
  it("hides empty and unknown values instead of showing placeholders", () => {
    const labels = staffOverview(staff()).map((i) => i.label);
    expect(labels).toEqual(["Category", "Status"]); // email, title, type (unknown), dates all empty
  });

  it("shows recorded values, links email, and shows end date only when recorded", () => {
    const o = staffOverview(staff({ workEmail: "ann@example.com", title: "Nurse practitioner", employmentType: "w2_full_time", startDate: "2025-03-01" }));
    expect(o.map((i) => i.label)).toEqual(["Work email", "Job title", "Category", "Employment type", "Status", "Start date"]);
    expect(o[0]).toMatchObject({ value: "ann@example.com", href: "mailto:ann@example.com" });
    expect(staffOverview(staff({ endDate: "2026-06-30", employmentStatus: "separated" })).map((i) => i.label)).toContain("End date");
  });

  it("keeps less frequent fields in Additional information, never empty", () => {
    expect(staffAdditional(staff({ credentials: null })).map((i) => i.label)).toEqual(["Staff number"]);
    expect(staffAdditional(staff({ npi: "1234567893", directoryVisible: false })).map((i) => i.label)).toEqual(["Credentials", "NPI", "Staff number", "Staff directory"]);
  });

  it("uses title, then credentials, as the subtitle; schedulable = physician or NP/PA", () => {
    expect(staffSubtitle(staff({ title: "Medical director" }))).toBe("Medical director");
    expect(staffSubtitle(staff())).toBeNull(); // "Ann Example, NP" already shows the credentials
    expect(staffSubtitle(staff({ displayName: "Ann Example" }))).toBe("NP");
    expect(staffSubtitle(staff({ credentials: null }))).toBeNull();
    expect(isSchedulable(staff())).toBe(true);
    expect(isSchedulable(staff({ category: "scribe" }))).toBe(false);
  });
});

describe("facility profile", () => {
  it("formats the address and omits missing parts", () => {
    expect(addressLines(facility().address)).toEqual([]);
    expect(addressLines({ line1: "1 Main St", line2: null, city: "Irvine", state: "CA", postalCode: "92618" })).toEqual(["1 Main St", "Irvine, CA 92618"]);
    expect(addressLines({ line1: null, line2: null, city: null, state: "CA", postalCode: null })).toEqual(["CA"]);
  });

  it("links phone and email, hides empty contact fields", () => {
    expect(facilityContact(facility())).toEqual([]);
    const c = facilityContact(facility({ phone: "(949) 555-0100", email: "desk@example.com" }));
    expect(c).toEqual([
      { label: "Phone", value: "(949) 555-0100", href: "tel:9495550100" },
      { label: "Email", value: "desk@example.com", href: "mailto:desk@example.com" },
    ]);
  });

  it("puts metadata and other names in Additional information", () => {
    const a = facilityAdditional({
      facility: facility({ legalName: "Example LLC", contract: { status: "Active", effectiveDate: "2025-01-01", endDate: null } }),
      aliases: [
        { id: "1", alias: "Example Care Center", type: "canonical_name" },
        { id: "2", alias: "Old Example Name", type: "former_name" },
      ],
    });
    expect(a.map((i) => [i.label, i.value])).toEqual([
      ["Legal name", "Example LLC"],
      ["Contract", "Active · from Jan 1, 2025"],
      ["Also known as", "Old Example Name"],
      ["Facility number", "F-0001"],
    ]);
  });

  it("reports archived before operational status", () => {
    expect(facilityStatus(facility())).toBe("Active");
    expect(facilityStatus(facility({ archivedAt: "2026-02-01T00:00:00Z" }))).toBe("Archived");
    expect(facilityStatus(facility({ operationalStatus: "unknown" }))).toBeNull();
  });
});
