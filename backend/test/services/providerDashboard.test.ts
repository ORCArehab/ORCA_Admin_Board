import { describe, expect, it, vi } from "vitest";
import type { SheetSource } from "../../src/config/sources.js";
import type { SheetsReader } from "../../src/integrations/google/sheets.js";
import { AppError } from "../../src/lib/errors.js";
import { ProviderDashboardService, buildProviderDashboard } from "../../src/services/providerDashboard.js";
import { TODAY, trackerConfig, trackerSnapshot } from "../fixtures/providerTracker.js";

const source: SheetSource = { key: "providerTracker", label: "ORCA-NP/Scribe Tracker 2026", spreadsheetId: "test-sheet" };

describe("buildProviderDashboard", () => {
  const dashboard = buildProviderDashboard(trackerSnapshot(), trackerConfig(), {
    today: TODAY,
    timezone: "America/Los_Angeles",
    sourceLabel: source.label,
  });

  it("reports completion basis and backlog basis in metadata", () => {
    expect(dashboard.meta.completionBasis).toBe("row-level-upload-flag");
    expect(dashboard.meta.backlogBasis.billingSheet).toMatch(/rows/);
    expect(dashboard.meta.asOfDate).toBe(TODAY);
  });

  it("lists providers including structurally broken ones as incomplete", () => {
    const byName = Object.fromEntries(dashboard.providers.map((p) => [p.name, p]));
    expect(Object.keys(byName).sort()).toEqual(["Bob Smith", "Jane Doe", "Kim Lee", "Old NP"]);
    expect(byName["Kim Lee"]).toMatchObject({ dataStatus: "incomplete", expectedNotes: 0, completionRate: null, tabs: ["KL"] });
    expect(byName["Jane Doe"]).toMatchObject({ dataStatus: "ok", warningCount: 5, tabs: ["JD"] });
    expect(byName["Bob Smith"]).toMatchObject({ expectedNotes: 2, completedNotes: 2, completionRate: 100 });
  });

  it("separates structural and row-level data-quality issues", () => {
    expect(dashboard.dataQuality.structuralIssues.every((i) => i.scope === "structure")).toBe(true);
    expect(dashboard.dataQuality.rowIssues.every((i) => i.scope === "row")).toBe(true);
    expect(dashboard.dataQuality.summary).toMatchObject({ MISSING_REQUIRED_COLUMNS: 1, MAPPED_TAB_NOT_FOUND: 1, TOTAL_MISMATCH: 1 });
  });

  it("never echoes REMARKS content", () => {
    expect(JSON.stringify(dashboard)).not.toContain("REMARK-SENTINEL");
  });
});

describe("ProviderDashboardService", () => {
  const now = () => new Date("2026-09-29T18:00:00Z");

  it("caches results within the TTL and refreshes on demand", async () => {
    const reader: SheetsReader = { readSpreadsheet: vi.fn(async () => trackerSnapshot()) };
    const service = new ProviderDashboardService({ reader, source, config: trackerConfig(), timezone: "America/Los_Angeles", cacheTtlMs: 60_000, now });

    expect((await service.getDashboard()).cached).toBe(false);
    expect((await service.getDashboard()).cached).toBe(true);
    expect((await service.getDashboard({ refresh: true })).cached).toBe(false);
    expect(reader.readSpreadsheet).toHaveBeenCalledTimes(2);
  });

  it("fails clearly when the source is not configured", async () => {
    const reader: SheetsReader = { readSpreadsheet: vi.fn() };
    const service = new ProviderDashboardService({ reader, source: undefined, config: trackerConfig(), timezone: "UTC", cacheTtlMs: 0, now });
    await expect(service.getDashboard()).rejects.toMatchObject({ statusCode: 503, code: "SOURCE_NOT_CONFIGURED" });
  });

  it("translates Google permission errors", async () => {
    const reader: SheetsReader = { readSpreadsheet: vi.fn(async () => Promise.reject(Object.assign(new Error("denied"), { code: 403 }))) };
    const service = new ProviderDashboardService({ reader, source, config: trackerConfig(), timezone: "UTC", cacheTtlMs: 0, now });
    const err = await service.getDashboard().catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ statusCode: 502, code: "SOURCE_ACCESS_DENIED" });
  });
});

describe("status coverage metadata", () => {
  it("tells the frontend which completion rates are lower bounds", () => {
    const d = buildProviderDashboard(trackerSnapshot(), trackerConfig(), { today: TODAY, timezone: "UTC", sourceLabel: "t" });
    expect(d.meta.statusCoverage).toMatchObject({ unknownStatusNotes: 1, providersWithUnknownStatus: ["Jane Doe"] });
    expect(d.meta.statusCoverage.expectedNotes).toBe(d.meta.statusCoverage.classifiedNotes + d.meta.statusCoverage.unknownStatusNotes);
    expect(d.meta.definitions.completionRate).toMatch(/lower bound/);
  });
});
