import { describe, expect, it } from "vitest";
import { computeScribeMetrics, metricsFor, productionSeries, weekStart } from "../../src/metrics/scribe/computeScribeMetrics.js";
import { buildScribeDashboard } from "../../src/services/scribeDashboard.js";
import { readScribeTracker } from "../../src/sources/scribeTracker/index.js";
import { DAILY_HEADER, SCRIBE_TODAY, dailyRows, scribeConfig, scribeSnapshot, t } from "../fixtures/scribeTracker.js";
import { serial } from "../fixtures/providerTracker.js";

describe("scribe tracker parsing", () => {
  const data = readScribeTracker(scribeSnapshot(), scribeConfig(), SCRIBE_TODAY);
  const at = (row: number) => data.rows.find((r) => r.row === row);
  const codesAt = (row: number) => data.issues.filter((i) => i.row === row).map((i) => i.code);

  it("uses only the Daily Production tab (not summaries or per-scribe history tabs)", () => {
    expect(data.sourceTab).toMatchObject({ title: "Daily Production", headerRow: 1 });
    expect(data.rows.every((r) => r.tab === "Daily Production")).toBe(true);
    expect(data.rows.map((r) => r.row)).toEqual([2, 3, 4, 7, 8, 9, 14]);
  });

  it("fills DATE and SCRIBE down only for rows matching the continuation structure", () => {
    expect(at(3)).toMatchObject({ scribe: "Ann", workDate: "2026-09-01", inheritedAttribution: true, total: 5, isSession: false });
    expect(at(4)).toMatchObject({ scribe: "Ann", workDate: "2026-09-01", inheritedAttribution: true, uploadedNotes: 20 });
    expect(at(2)?.inheritedAttribution).toBe(false);
    expect(codesAt(3)).toContain("INHERITED_ATTRIBUTION");
  });

  it("does not fill down across a blank row", () => {
    expect(at(6)).toBeUndefined();
    expect(codesAt(6)).toEqual(["UNATTRIBUTED_ROW"]);
  });

  it("uses stored hours and validates them against clock times, handling midnight", () => {
    expect(at(2)).toMatchObject({ storedHours: 8, clockHours: 8, crossesMidnight: false });
    expect(at(7)).toMatchObject({ storedHours: 5, clockHours: 5, crossesMidnight: true });
    expect(codesAt(7)).not.toContain("HOURS_MISMATCH");
    expect(at(8)).toMatchObject({ storedHours: 3, clockHours: 8 }); // stored value kept
    expect(codesAt(8)).toContain("HOURS_MISMATCH");
  });

  it("keeps suspicious durations and flags them as information", () => {
    expect(at(9)?.storedHours).toBeCloseTo(5 / 60, 6);
    expect(codesAt(9)).toContain("SHORT_SESSION");
  });

  it("flags and excludes rows it cannot attribute or read", () => {
    expect(codesAt(10)).toEqual(["OUT_OF_RANGE_DATE"]);
    expect(codesAt(11)).toEqual(["INVALID_DATE"]);
    expect(codesAt(12)).toEqual(["INVALID_SCRIBE"]);
    expect(codesAt(13)).toEqual(["MISSING_ATTRIBUTION"]);
  });

  it("flags incomplete breaks and unreadable counts without repairing them", () => {
    expect(at(14)).toMatchObject({ storedHours: 4, clockHours: null, total: null });
    expect(codesAt(14)).toEqual(expect.arrayContaining(["BREAK_INCOMPLETE", "INVALID_NUMBER"]));
  });

  it("flags a blank TOTAL next to filled-in note counts without back-filling it", () => {
    const d = readScribeTracker(
      scribeSnapshot([DAILY_HEADER, [serial("2026-09-21"), "Cy", t(9), null, null, t(11), t(2), "Facility A", serial("2026-09-18"), null, 25, null, "", null, null]]),
      scribeConfig(),
      SCRIBE_TODAY,
    );
    expect(d.rows[0]).toMatchObject({ total: null, progressNotes: 25 });
    expect(d.issues.map((i) => i.code)).toContain("MISSING_TOTAL");
  });

  it("marks multi-facility entries and never counts EXTRA NOTES", () => {
    expect(at(7)).toMatchObject({ multiFacility: true });
    expect(at(8)?.extraNotesPattern).toBe("… <date> <n> notes uploaded");
    expect(at(8)?.total).toBe(10); // the "5 notes" in EXTRA NOTES is not added
  });

  it("detects the production tab by structure, and reports ambiguity", () => {
    const snap = scribeSnapshot();
    snap.tabs.push({ sheetId: 9, title: "Copy", hidden: false, index: 3, values: [DAILY_HEADER] });
    expect(readScribeTracker(snap, scribeConfig(), SCRIBE_TODAY).issues.map((i) => i.code)).toEqual(["AMBIGUOUS_PRODUCTION_TAB"]);
    expect(readScribeTracker(snap, scribeConfig({ productionTab: "gid:2" }), SCRIBE_TODAY).rows).toHaveLength(7);
  });

  it("maps scribe names to canonical names from config", () => {
    const d = readScribeTracker(scribeSnapshot(), scribeConfig({ scribes: { ann: "Ann Example" } }), SCRIBE_TODAY);
    expect(new Set(d.rows.map((r) => r.scribe))).toEqual(new Set(["Ann Example", "Bea"]));
  });
});

describe("scribe metrics", () => {
  const data = readScribeTracker(scribeSnapshot(), scribeConfig(), SCRIBE_TODAY);
  const [ann, bea] = computeScribeMetrics(data.rows);

  it("computes per-scribe production, hours and uploads separately", () => {
    expect(ann).toEqual({
      name: "Ann",
      notesProduced: 23, // 12 + 5 (continuation) + 6; row 14 TOTAL unreadable
      consults: 4,
      followUps: 22,
      hoursWorked: 17, // 8 + 5 + 4 stored
      notesPerHour: 1.4, // 23 / 17
      notesUploaded: 20, // continuation row
      sessions: 3,
      workDays: 2,
      facilitiesWorked: 2, // Facility A, Facility B (multi-facility entry not attributed)
      multiFacilityEntries: 1,
      unallocatedFacilityNotes: 6,
      firstWorkDate: "2026-09-01",
      lastWorkDate: "2026-09-08",
    });
    expect(bea).toMatchObject({ notesProduced: 10, hoursWorked: 3.08, notesPerHour: 3.2, notesUploaded: 16, sessions: 2, facilitiesWorked: 1 });
  });

  it("uses all hours, including upload-only sessions, in notes per hour", () => {
    const beaRows = data.rows.filter((r) => r.scribe === "Bea");
    expect(metricsFor("Bea", beaRows).notesPerHour).toBe(3.2); // 10 / (3 + 5 min), not 10 / 3
  });

  it("aggregates totals from rows, not by averaging row AVERAGE values", () => {
    const all = metricsFor("All", data.rows);
    expect(all).toMatchObject({ notesProduced: 33, hoursWorked: 20.08, notesPerHour: 1.6, notesUploaded: 36 });
  });

  it("buckets production by work date: day, ISO week (Monday) and month", () => {
    expect(weekStart("2026-09-01")).toBe("2026-08-31");
    expect(weekStart("2026-09-06")).toBe("2026-08-31");
    const s = productionSeries(data.rows);
    expect(s.weekly.map((w) => [w.period, w.notesProduced, w.hoursWorked])).toEqual([
      ["2026-08-31", 33, 16.08],
      ["2026-09-07", 0, 4],
    ]);
    expect(s.monthly).toEqual([expect.objectContaining({ period: "2026-09", notesProduced: 33, notesUploaded: 36 })]);
    expect(s.daily.map((d) => d.period)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-08"]);
  });

  it("returns null notes per hour when there are no hours", () => {
    const rows = readScribeTracker(
      scribeSnapshot([DAILY_HEADER, [serial("2026-09-01"), "Cy", null, null, null, null, "", "Facility A", serial("2026-08-30"), 0, 2, 2, "", null, null]]),
      scribeConfig(),
      SCRIBE_TODAY,
    ).rows;
    expect(metricsFor("Cy", rows)).toMatchObject({ notesProduced: 2, hoursWorked: 0, notesPerHour: null });
  });
});

describe("scribe dashboard payload", () => {
  const d = buildScribeDashboard(scribeSnapshot(), scribeConfig(), { today: SCRIBE_TODAY, timezone: "UTC", sourceLabel: "Scribe Tracker" });

  it("states its scope explicitly", () => {
    expect(d.meta.scope).toMatchObject({ sourceTab: "Daily Production", historyStartsOn: "2026-08-01", dataThrough: "2026-09-08" });
    expect(d.meta.scope.note).toMatch(/Daily Production/);
    expect(d.meta.hoursBasis).toBe("stored-total-hours");
  });

  it("lists scribes alphabetically with no ranking or completion fields", () => {
    expect(d.scribes.map((s) => s.name)).toEqual(["Ann", "Bea"]);
    const keys = Object.keys(d.scribes[0]!);
    for (const banned of ["completionRate", "outstandingNotes", "rank", "score"]) expect(keys).not.toContain(banned);
  });

  it("reports inherited rows and EXTRA NOTES patterns for data quality only", () => {
    expect(d.dataQuality.inheritedRows).toBe(2);
    expect(d.dataQuality.extraNotesPatterns).toEqual([{ pattern: "… <date> <n> notes uploaded", rows: 1 }]);
  });

  it("does not use summary or per-scribe history values", () => {
    const json = JSON.stringify(d);
    expect(json).not.toContain("505");
    expect(d.totals.notesProduced).toBe(33);
  });

  it("keeps clock math at time-of-day precision for date-time cells", () => {
    const rows = readScribeTracker(
      scribeSnapshot([DAILY_HEADER, [serial("2026-09-01"), "Cy", serial("2026-09-01") + t(9), null, null, t(17), t(8), "Facility A", null, 0, 1, 1, "", null, null]]),
      scribeConfig(),
      SCRIBE_TODAY,
    );
    expect(rows.rows[0]).toMatchObject({ clockHours: 8 });
    expect(rows.issues.map((i) => i.code)).not.toContain("HOURS_MISMATCH");
  });
});

// Keep the fixture honest: header row plus 14 data rows.
it("fixture sanity", () => expect(dailyRows).toHaveLength(15));
