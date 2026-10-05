import { describe, expect, it } from "vitest";
import { missingRequired, toFormValues, toPayload, type SectionDef } from "./form";

const sections: SectionDef[] = [
  {
    title: "Main",
    fields: [
      { name: "name", label: "Name", required: true },
      { name: "abbreviation", label: "Abbreviation" },
      { name: "archived", label: "Archived", kind: "checkbox" },
    ],
  },
  { title: "Address", fields: [{ name: "address.city", label: "City" }, { name: "address.state", label: "State" }] },
];

const record = { name: "Sample Post Acute", abbreviation: null, archived: false, address: { city: "Demotown", state: "CA" } };

describe("toFormValues", () => {
  it("reads nested fields, turning null into an empty input", () => {
    expect(toFormValues(sections, record)).toEqual({ name: "Sample Post Acute", abbreviation: "", archived: false, "address.city": "Demotown", "address.state": "CA" });
  });

  it("uses defaults for a new record", () => {
    expect(toFormValues(sections, null, { "address.state": "CA" })["address.state"]).toBe("CA");
  });
});

describe("toPayload", () => {
  it("sends only changed fields for an edit, nested, with cleared fields as null", () => {
    const initial = toFormValues(sections, record);
    const values = { ...initial, "address.city": "  New Town ", "address.state": "", name: "Sample Post Acute " };
    expect(toPayload(sections, values, initial)).toEqual({ address: { city: "New Town", state: null } });
  });

  it("sends nothing when nothing changed", () => {
    const initial = toFormValues(sections, record);
    expect(toPayload(sections, { ...initial }, initial)).toEqual({});
  });

  it("sends every filled field for a new record, and checkboxes always", () => {
    const values = { name: "Harbor View", abbreviation: "", archived: false, "address.city": "Seaside", "address.state": "" };
    expect(toPayload(sections, values, null)).toEqual({ name: "Harbor View", archived: false, address: { city: "Seaside" } });
  });
});

describe("missingRequired", () => {
  it("names required fields left blank", () => {
    expect(missingRequired(sections, { name: "  " })).toEqual([{ field: "name", message: "Name is required" }]);
  });
});
