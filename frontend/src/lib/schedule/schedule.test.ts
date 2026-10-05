import { describe, expect, it } from "vitest";
import { facilityRows, providerRows, type BoardFilters } from "./board";
import { entryLabel, timeText } from "./format";
import type { Assignment, ScheduleBoardData } from "./types";
import { addDays, dayHeading, isIsoDate, today, weekDays, weekLabel, weekStart } from "./week";

describe("weeks", () => {
  it("start on Monday, whatever the day", () => {
    expect(weekStart("2026-10-12")).toBe("2026-10-12"); // Monday
    expect(weekStart("2026-10-14")).toBe("2026-10-12");
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // Sunday
    expect(weekStart("2027-01-01")).toBe("2026-12-28");
    expect(weekDays("2026-10-12")).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  });

  it("step across months, years and daylight saving without drifting", () => {
    expect(addDays("2026-10-26", 7)).toBe("2026-11-02"); // DST ends Nov 1
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(addDays("2026-10-12", -7)).toBe("2026-10-05");
  });

  it("know today in ORCA's timezone", () => {
    // 2026-10-13 05:00 UTC is still Oct 12 in Los Angeles.
    expect(today(new Date("2026-10-13T05:00:00Z"))).toBe("2026-10-12");
  });

  it("label weeks and days", () => {
    expect(weekLabel("2026-10-12")).toBe("Oct 12 – 18, 2026");
    expect(weekLabel("2026-09-28")).toBe("Sep 28 – Oct 4, 2026");
    expect(weekLabel("2026-12-28")).toBe("Dec 28, 2026 – Jan 3, 2027");
    expect(dayHeading("2026-10-12")).toEqual({ weekday: "Mon", day: "Oct 12" });
  });

  it("validate dates", () => {
    expect(isIsoDate("2026-10-12")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("10/12/2026")).toBe(false);
  });
});

const base: Assignment = { id: "x", staffId: "pat", date: "2026-10-12", type: "facility", facilityId: "alpha", coveringStaffId: null, timeBlock: "am", startTime: null, endTime: null, notes: null };
const entry = (over: Partial<Assignment>): Assignment => ({ ...base, ...over });

describe("labels", () => {
  const alpha = { id: "alpha", name: "Alpha Post Acute", abbreviation: "APA", operationalStatus: "active" };
  it("use the facility abbreviation, falling back to its name", () => {
    expect(entryLabel(base, alpha)).toBe("APA");
    expect(entryLabel(base, { ...alpha, abbreviation: null })).toBe("Alpha Post Acute");
    expect(entryLabel(entry({ type: "coverage" }), alpha)).toBe("Cov · APA");
    expect(entryLabel(entry({ type: "pto", facilityId: null }), undefined)).toBe("PTO");
    expect(entryLabel(entry({ type: "admin", facilityId: null }), undefined)).toBe("Admin");
  });
  it("show compact times", () => {
    expect(timeText(base)).toBe("AM");
    expect(timeText(entry({ timeBlock: "all_day" }))).toBe("");
    expect(timeText(entry({ timeBlock: "custom", startTime: "09:00", endTime: "17:30" }))).toBe("9a–5:30p");
    expect(timeText(entry({ timeBlock: "custom", startTime: "12:00", endTime: "13:00" }))).toBe("12p–1p");
  });
});

describe("board views are projections of the same entries", () => {
  const data: ScheduleBoardData = {
    from: "2026-10-12",
    to: "2026-10-18",
    staff: [
      { id: "pat", displayName: "Pat Provider", credentials: "NP", category: "np_pa", employmentStatus: "active" },
      { id: "quinn", displayName: "Quinn Physician", credentials: "MD", category: "physician", employmentStatus: "active" },
      { id: "ria", displayName: "Ria Idle", credentials: "PA", category: "np_pa", employmentStatus: "active" },
      { id: "sam", displayName: "Sam Scribe", credentials: null, category: "scribe", employmentStatus: "active" },
    ],
    facilities: [
      { id: "alpha", name: "Alpha Post Acute", abbreviation: "APA", operationalStatus: "active" },
      { id: "beta", name: "Beta Care", abbreviation: "BC", operationalStatus: "active" },
      { id: "gamma", name: "Gamma Rehab", abbreviation: null, operationalStatus: "inactive" },
      { id: "delta", name: "Delta Unknown Care", abbreviation: "DUC", operationalStatus: "unknown" },
      { id: "eps", name: "Epsilon Future Care", abbreviation: "EFC", operationalStatus: "prospective" },
    ],
    assignments: [
      entry({ id: "1" }),
      entry({ id: "2", facilityId: "beta", timeBlock: "pm" }),
      entry({ id: "3", staffId: "quinn", date: "2026-10-13", facilityId: "alpha", timeBlock: "all_day" }),
      entry({ id: "4", date: "2026-10-14", type: "pto", facilityId: null, timeBlock: "all_day" }),
    ],
  };
  const none: BoardFilters = { search: "", staffId: null, facilityId: null, showAll: false };

  it("by provider: one row per provider with entries, entries in their day cells", () => {
    const rows = providerRows(data, "2026-10-12", none);
    expect(rows.map((r) => r.key)).toEqual(["pat", "quinn"]);
    expect(rows[0]!.cells["2026-10-12"]!.map((a) => a.id)).toEqual(["1", "2"]);
    expect(rows[0]!.cells["2026-10-14"]!.map((a) => a.id)).toEqual(["4"]);
  });

  it("show all adds idle providers but not other staff", () => {
    expect(providerRows(data, "2026-10-12", { ...none, showAll: true }).map((r) => r.key)).toEqual(["pat", "quinn", "ria"]);
  });

  it("by facility: the same entries, with no-facility entries kept apart", () => {
    const { rows, elsewhere } = facilityRows(data, "2026-10-12", none);
    expect(rows.map((r) => r.key)).toEqual(["alpha", "beta"]);
    expect(rows[0]!.cells["2026-10-12"]!.map((a) => a.id)).toEqual(["1"]);
    expect(rows[0]!.cells["2026-10-13"]!.map((a) => a.id)).toEqual(["3"]);
    expect(elsewhere?.cells["2026-10-14"]!.map((a) => a.id)).toEqual(["4"]);
    const total = (cells: Record<string, Assignment[]>) => Object.values(cells).flat().length;
    const providerTotal = providerRows(data, "2026-10-12", none).reduce((n, r) => n + total(r.cells), 0);
    const facilityTotal = rows.reduce((n, r) => n + total(r.cells), 0) + total(elsewhere!.cells);
    expect(facilityTotal).toBe(providerTotal);
  });

  it("show all adds active facilities and those whose status isn't known yet, not inactive or prospective ones", () => {
    expect(facilityRows(data, "2026-10-12", { ...none, showAll: true }).rows.map((r) => r.key)).toEqual(["alpha", "beta", "delta"]);
  });

  it("filters by provider, facility and search", () => {
    expect(providerRows(data, "2026-10-12", { ...none, facilityId: "beta" }).map((r) => r.key)).toEqual(["pat"]);
    expect(providerRows(data, "2026-10-12", { ...none, staffId: "ria" }).map((r) => r.key)).toEqual(["ria"]);
    expect(providerRows(data, "2026-10-12", { ...none, search: "quin" }).map((r) => r.key)).toEqual(["quinn"]);
    const byQuinn = facilityRows(data, "2026-10-12", { ...none, staffId: "quinn" });
    expect(byQuinn.rows.map((r) => r.key)).toEqual(["alpha"]);
    expect(byQuinn.elsewhere).toBeNull();
    expect(facilityRows(data, "2026-10-12", { ...none, search: "apa" }).rows.map((r) => r.key)).toEqual(["alpha"]);
  });
});
