import { describe, expect, it } from "vitest";
import { normalizeFreeText, safeCellValue, summarizeStatusTextPatterns } from "../../src/sources/providerTracker/statusText.js";
import { buildProviderDashboard } from "../../src/services/providerDashboard.js";
import { TODAY, trackerConfig, trackerSnapshot } from "../fixtures/providerTracker.js";

describe("free-text normalization", () => {
  it("keeps only workflow vocabulary, dates and numbers", () => {
    expect(normalizeFreeText("AB 1/2/26 uploaded")).toBe("… <date> uploaded");
    expect(normalizeFreeText("Mary Smith, John Doe pending for upload")).toBe("… pending for upload");
    expect(normalizeFreeText("3 pts missing billing sheet")).toBe("<n> … missing billing sheet");
    expect(normalizeFreeText("Zyx")).toBe("…");
  });

  it("passes non-strings through unchanged", () => {
    expect(safeCellValue(5)).toBe(5);
    expect(safeCellValue(null)).toBeNull();
  });

  it("aggregates patterns by column with note totals", () => {
    const rows = [
      { total: 5, statusTextPatterns: { uploadedNotes: "… <date> uploaded" } },
      { total: 7, statusTextPatterns: { uploadedNotes: "… <date> uploaded", billingSheet: "…" } },
      { total: 2 },
    ];
    expect(summarizeStatusTextPatterns(rows)).toEqual([
      { column: "billingSheet", pattern: "…", rows: 1, notes: 7 },
      { column: "uploadedNotes", pattern: "… <date> uploaded", rows: 2, notes: 12 },
    ]);
  });

  it("never exposes raw free text in the dashboard payload", () => {
    const snapshot = trackerSnapshot();
    snapshot.tabs.find((t) => t.title === "JD")!.values.push([46000, "Facility A", "JQ billing 9/1", 1, 0, 1, "JQ 9/2/26 uploaded", true]);
    const dashboard = buildProviderDashboard(snapshot, trackerConfig(), { today: TODAY, timezone: "UTC", sourceLabel: "t" });
    const json = JSON.stringify(dashboard);
    expect(json).not.toContain("JQ");
    expect(dashboard.dataQuality.statusTextPatterns).toContainEqual({ column: "uploadedNotes", pattern: "… <date> uploaded", rows: 1, notes: 1 });
  });
});
