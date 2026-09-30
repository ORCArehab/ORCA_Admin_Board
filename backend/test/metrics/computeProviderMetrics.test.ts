import { describe, expect, it } from "vitest";
import { computeMetricsForRows, computeProviderMetrics } from "../../src/metrics/provider/computeProviderMetrics.js";
import type { ProviderRow } from "../../src/sources/providerTracker/index.js";
import { readProviderTracker } from "../../src/sources/providerTracker/index.js";
import { TODAY, trackerConfig, trackerSnapshot } from "../fixtures/providerTracker.js";

function row(overrides: Partial<ProviderRow>): ProviderRow {
  return {
    provider: "P",
    tab: "P",
    sheetId: 1,
    row: 2,
    visitDate: "2026-09-01",
    facilities: "A",
    multiFacility: false,
    consultNotes: 0,
    progressNotes: 0,
    total: 0,
    uploadedNotes: "unchecked",
    billingSheet: "unchecked",
    faceSheet: "unchecked",
    ...overrides,
  };
}

describe("provider metrics", () => {
  it("computes V1 metrics from the fixture tracker", () => {
    const data = readProviderTracker(trackerSnapshot(), trackerConfig(), TODAY);
    const metrics = computeProviderMetrics(data.providers, data.rows, TODAY);
    const jane = metrics.find((m) => m.name === "Jane Doe");

    expect(jane).toEqual({
      name: "Jane Doe",
      expectedNotes: 24, // 5+5+6+3+2+1+2 (row 10 has no TOTAL)
      completedNotes: 8, // rows 3, 8
      outstandingNotes: 15, // rows 4, 5, 9, 14
      unknownStatusNotes: 1, // row 11 "Pending"
      completionRate: 33.3,
      outstandingBatches: 4,
      oldestOutstandingDays: 19, // 2026-09-10 (rows 9 and 14 have no usable date)
      oldestOutstandingVisitDate: "2026-09-10",
      consults: 8,
      followUps: 16,
      billingSheetBacklog: 4, // rows 4, 5, 9, 14
      facesheetBacklog: 3, // rows 4, 9, 14 (row 5 facesheet blank = not tracked)
    });
  });

  it("returns completionRate null when nothing is expected", () => {
    expect(computeMetricsForRows("P", [row({ total: 0 })], TODAY).completionRate).toBeNull();
    expect(computeMetricsForRows("Empty", [], TODAY)).toMatchObject({ expectedNotes: 0, completionRate: null, oldestOutstandingDays: null });
  });

  it("counts backlogs as batches, not notes", () => {
    const m = computeMetricsForRows("P", [row({ total: 40 }), row({ total: 12 }), row({ total: 0 })], TODAY);
    expect(m.billingSheetBacklog).toBe(2);
    expect(m.facesheetBacklog).toBe(2);
    expect(m.outstandingNotes).toBe(52);
  });

  it("includes providers without rows and sorts by attention needed", () => {
    const rows = [
      row({ provider: "A", total: 2, visitDate: "2026-09-20" }),
      row({ provider: "B", total: 5, visitDate: "2026-09-25" }),
      row({ provider: "C", total: 2, visitDate: "2026-09-01" }),
    ];
    const names = computeProviderMetrics(["A", "B", "C", "D"], rows, TODAY).map((m) => m.name);
    expect(names).toEqual(["B", "C", "A", "D"]);
  });
});
