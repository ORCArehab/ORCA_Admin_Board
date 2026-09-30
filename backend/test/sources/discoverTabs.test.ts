import { describe, expect, it } from "vitest";
import { discoverProviderTabs } from "../../src/sources/providerTracker/discoverTabs.js";
import { trackerConfig, trackerSnapshot } from "../fixtures/providerTracker.js";

describe("discoverProviderTabs", () => {
  const { tabs, issues } = discoverProviderTabs(trackerSnapshot().tabs, trackerConfig());
  const byTitle = Object.fromEntries(tabs.map((t) => [t.tab.title, t]));

  it("classifies tabs by header structure and config, not position", () => {
    expect(byTitle["Dashboard"]?.status).toBe("not-provider");
    expect(byTitle["BILLER"]?.status).toBe("excluded");
    expect(byTitle["JD"]?.status).toBe("provider");
    expect(byTitle["Bob Smith"]?.status).toBe("provider");
    expect(byTitle["KL"]?.status).toBe("invalid");
    expect(byTitle["Old NP"]).toMatchObject({ status: "provider", nameSource: "tabTitle" }); // hidden state is not a business rule
  });

  it("maps tab identifiers to canonical provider names", () => {
    expect(byTitle["JD"]).toMatchObject({ providerName: "Jane Doe", nameSource: "config" });
    expect(byTitle["Bob Smith"]).toMatchObject({ providerName: "Bob Smith", nameSource: "tabTitle" });
  });

  it("surfaces structural problems", () => {
    const codes = issues.map((i) => `${i.code}:${i.severity}`);
    expect(codes).toContain("MISSING_REQUIRED_COLUMNS:error");
    expect(codes).toContain("MAPPED_TAB_NOT_FOUND:error");
    expect(codes).toContain("UNMAPPED_TAB:info");
    const missing = issues.find((i) => i.code === "MISSING_REQUIRED_COLUMNS");
    expect(missing).toMatchObject({ tab: "KL", provider: "Kim Lee" });
    expect(missing?.message).toContain("uploadedNotes");
  });

  it("can ignore unmapped tabs (hidden or not)", () => {
    const result = discoverProviderTabs(trackerSnapshot().tabs, trackerConfig({ unmappedTabs: "ignore" }));
    const status = Object.fromEntries(result.tabs.map((t) => [t.tab.title, t.status]));
    expect(status["Bob Smith"]).toBe("unmapped-ignored");
    expect(status["Old NP"]).toBe("unmapped-ignored");
  });

  it("would treat the BILLER summary as a possible provider tab if not excluded", () => {
    const result = discoverProviderTabs(trackerSnapshot().tabs, trackerConfig({ excludeTabs: [] }));
    expect(result.tabs.find((t) => t.tab.title === "BILLER")?.status).toBe("provider");
  });
});

describe("explicit provider inclusion", () => {
  it("includes a hidden tab when it is mapped, and excludes a visible one when listed", () => {
    const config = trackerConfig({ providers: { "gid:600": "Former NP" }, excludeTabs: ["BILLER", "Bob Smith"] });
    const status = Object.fromEntries(discoverProviderTabs(trackerSnapshot().tabs, config).tabs.map((t) => [t.tab.title, [t.status, t.providerName]]));
    expect(status["Old NP"]).toEqual(["provider", "Former NP"]);
    expect(status["Bob Smith"]?.[0]).toBe("excluded");
  });
});
