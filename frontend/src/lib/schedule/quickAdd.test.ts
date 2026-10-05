import { describe, expect, it } from "vitest";
import { copyInput, planDrop } from "./dragDrop";
import { buildQuickInput, DEFAULT_CHOICES } from "./quickAdd";
import { facilityOptions, searchOptions, specialOptions, staffOptions } from "./search";
import type { Assignment, FacilityRecord, StaffRecord } from "./types";

const staff: StaffRecord[] = [
  { id: "s-chel", displayName: "Chelsea Gainor, NP", credentials: "NP", category: "np_pa", firstName: "Chelsea", lastName: "Gainor", aliases: ["CG"] },
  { id: "s-liz", displayName: "Elizabeth Moreno, MD", credentials: "MD", category: "physician", firstName: "Elizabeth", lastName: "Moreno", preferredName: "Liz" },
  { id: "s-rachel", displayName: "Rachel Ochoa", credentials: null, category: "scribe", firstName: "Rachel", lastName: "Ochoa" },
  { id: "s-gone", displayName: "Chelle Former, PA-C", credentials: "PA-C", category: "np_pa", employmentStatus: "separated" },
];
const facilities: FacilityRecord[] = [
  { id: "f-at", name: "Anaheim Terrace Care Center", abbreviation: "AT", operationalStatus: "active", city: "Anaheim" },
  { id: "f-atl", name: "Atlantic Post Acute", abbreviation: "APA", operationalStatus: "active" },
  { id: "f-gp", name: "Garden Park", abbreviation: "GP", operationalStatus: "active", aliases: ["Garden Park Care Center LLC"] },
  { id: "f-old", name: "Seaside Gardens", abbreviation: "SG", operationalStatus: "inactive", aliases: ["Bayview Manor"] },
];

const top = (options: ReturnType<typeof staffOptions>, q: string) => searchOptions(options, q)[0];

describe("quick add search", () => {
  const people = staffOptions(staff);
  const places = facilityOptions(facilities);

  it("finds people by any part of their name, providers first, never separated staff", () => {
    expect(top(people, "chel")!.option.id).toBe("s-chel");
    expect(searchOptions(people, "chel").map((r) => r.option.id)).toEqual(["s-chel", "s-rachel"]);
    expect(top(people, "gain")!.option.id).toBe("s-chel");
  });

  it("finds people by preferred name and aliases, saying which name matched", () => {
    expect(top(people, "liz")).toEqual({ option: expect.objectContaining({ id: "s-liz" }), matched: "Liz" });
    expect(top(people, "cg")!.option.id).toBe("s-chel");
  });

  it("puts an exact abbreviation first", () => {
    const results = searchOptions(places, "AT");
    expect(results[0]!.option).toMatchObject({ id: "f-at", label: "AT — Anaheim Terrace Care Center" });
    expect(results.map((r) => r.option.id)).toContain("f-atl");
  });

  it("finds facilities by name words and aliases, active before inactive", () => {
    expect(searchOptions(places, "garden").map((r) => r.option.id)).toEqual(["f-gp", "f-old"]);
    expect(top(places, "bayview")).toEqual({ option: expect.objectContaining({ id: "f-old", detail: "Inactive" }), matched: "Bayview Manor" });
    expect(searchOptions(places, "zzz")).toEqual([]);
  });

  it("matches punctuation-free, as the API's alias keys do", () => {
    expect(top(places, "a.t.")!.option.id).toBe("f-at");
  });

  it("lets PTO, Off, Admin and Clinic be typed in the facility box", () => {
    const options = [...places, ...specialOptions()];
    expect(top(options, "pto")!.option).toMatchObject({ kind: "special", id: "pto" });
    expect(top(options, "vacation")!.option.id).toBe("pto");
    expect(top(options, "off")!.option.id).toBe("off");
    // A facility the user means still wins a shared prefix.
    expect(top(options, "a")!.option.kind).toBe("facility");
  });

  it("lists everything, in order, before anything is typed", () => {
    expect(searchOptions(people, "").map((r) => r.option.id)).toEqual(["s-chel", "s-liz", "s-rachel"]);
  });
});

describe("quick add builds the same request the full form would", () => {
  it("facility view: the row's facility and the column's date, all day by default", () => {
    expect(buildQuickInput({ date: "2026-10-14", facilityId: "f-at" }, { kind: "staff", id: "s-chel" }, DEFAULT_CHOICES)).toEqual({
      ok: true,
      input: { staffId: "s-chel", date: "2026-10-14", type: "facility", facilityId: "f-at", coveringStaffId: null, timeBlock: "all_day", startTime: null, endTime: null, notes: null },
    });
  });

  it("provider view: the row's provider; a facility, or a typed PTO/Off/Admin/Clinic with no facility", () => {
    const ctx = { date: "2026-10-14", staffId: "s-chel" };
    expect(buildQuickInput(ctx, { kind: "facility", id: "f-gp" }, { ...DEFAULT_CHOICES, timeBlock: "am" })).toMatchObject({ ok: true, input: { facilityId: "f-gp", type: "facility", timeBlock: "am" } });
    expect(buildQuickInput(ctx, { kind: "special", id: "pto" }, DEFAULT_CHOICES)).toMatchObject({ ok: true, input: { type: "pto", facilityId: null, timeBlock: "all_day" } });
  });

  it("more options: coverage keeps who's covered, custom times and notes go through, others are dropped", () => {
    const choices = { ...DEFAULT_CHOICES, type: "coverage" as const, coveringStaffId: "s-liz", timeBlock: "custom" as const, startTime: "08:00", endTime: "12:30", notes: "  call ahead " };
    expect(buildQuickInput({ date: "2026-10-14", facilityId: "f-at" }, { kind: "staff", id: "s-chel" }, choices)).toMatchObject({
      ok: true,
      input: { type: "coverage", coveringStaffId: "s-liz", timeBlock: "custom", startTime: "08:00", endTime: "12:30", notes: "call ahead" },
    });
    const plain = buildQuickInput({ date: "2026-10-14", facilityId: "f-at" }, { kind: "staff", id: "s-chel" }, { ...choices, type: "admin", timeBlock: "pm" });
    expect(plain).toMatchObject({ ok: true, input: { type: "admin", coveringStaffId: null, startTime: null, endTime: null } });
  });

  it("refuses custom times that end before they start, and the wrong kind of pick", () => {
    const bad = { ...DEFAULT_CHOICES, timeBlock: "custom" as const, startTime: "12:00", endTime: "09:00" };
    expect(buildQuickInput({ date: "2026-10-14", facilityId: "f-at" }, { kind: "staff", id: "s-chel" }, bad).ok).toBe(false);
    expect(buildQuickInput({ date: "2026-10-14", facilityId: "f-at" }, { kind: "facility", id: "f-gp" }, DEFAULT_CHOICES).ok).toBe(false);
  });
});

describe("drag and drop", () => {
  const entry: Assignment = { id: "a1", staffId: "s-chel", date: "2026-10-14", type: "facility", facilityId: "f-at", coveringStaffId: null, timeBlock: "am", startTime: null, endTime: null, notes: "n" };
  const pto: Assignment = { ...entry, id: "a2", type: "pto", facilityId: null };

  it("moves to another day and provider (provider view) or facility (facility view)", () => {
    expect(planDrop(entry, { date: "2026-10-15", staffId: "s-liz" })).toEqual({ kind: "change", changes: { date: "2026-10-15", staffId: "s-liz" } });
    expect(planDrop(entry, { date: "2026-10-14", facilityId: "f-gp" })).toEqual({ kind: "change", changes: { facilityId: "f-gp" } });
    expect(planDrop(entry, { date: "2026-10-14", staffId: "s-chel" })).toEqual({ kind: "none" });
  });

  it("keeps facility entries at a facility and PTO/off away from one", () => {
    expect(planDrop(entry, { date: "2026-10-14", facilityId: null }).kind).toBe("invalid");
    expect(planDrop(pto, { date: "2026-10-15", facilityId: "f-at" }).kind).toBe("invalid");
    expect(planDrop(pto, { date: "2026-10-15", facilityId: null })).toEqual({ kind: "change", changes: { date: "2026-10-15" } });
    expect(planDrop({ ...entry, type: "admin" }, { date: "2026-10-14", facilityId: null })).toEqual({ kind: "change", changes: { facilityId: null } });
  });

  it("copies everything about the entry except where it lands", () => {
    expect(copyInput(entry, { date: "2026-10-16" })).toEqual({ staffId: "s-chel", date: "2026-10-16", type: "facility", facilityId: "f-at", coveringStaffId: null, timeBlock: "am", startTime: null, endTime: null, notes: "n" });
  });
});
