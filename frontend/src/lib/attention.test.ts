import { describe, expect, it } from "vitest";
import { ATTENTION_CRITERIA, attentionReasons, hasLimitedCoverage, needsAttention } from "./attention";
import type { ProviderEntry } from "./types";

function provider(overrides: Partial<ProviderEntry>): ProviderEntry {
  return {
    name: "P",
    dataStatus: "ok",
    warningCount: 0,
    tabs: [],
    expectedNotes: 100,
    completedNotes: 100,
    outstandingNotes: 0,
    unknownStatusNotes: 0,
    classifiedNotes: 100,
    completionRate: 100,
    statusCoveragePercent: 100,
    outstandingBatches: 0,
    oldestOutstandingDays: null,
    oldestOutstandingVisitDate: null,
    consults: 0,
    followUps: 0,
    billingSheetBacklog: 0,
    facesheetBacklog: 0,
    ...overrides,
  };
}

describe("needs attention", () => {
  it("explains every reason explicitly", () => {
    const p = provider({ outstandingNotes: 473, oldestOutstandingDays: 91, statusCoveragePercent: 46.5, dataStatus: "incomplete" });
    expect(attentionReasons(p).map((r) => r.label)).toEqual([
      "473 outstanding",
      "Oldest outstanding: 91 days",
      "46.5% status coverage",
      "Some source data needs review",
    ]);
  });

  it("does not list healthy providers", () => {
    expect(attentionReasons(provider({ outstandingNotes: 5, oldestOutstandingDays: 3 }))).toEqual([]);
  });

  it("lists top-outstanding providers even when recent, keeping backend order", () => {
    const providers = [
      provider({ name: "A", outstandingNotes: 50, oldestOutstandingDays: 2 }),
      provider({ name: "B", outstandingNotes: 40, oldestOutstandingDays: 45 }),
      ...Array.from({ length: 6 }, (_, i) => provider({ name: `R${i}`, outstandingNotes: 10 - i, oldestOutstandingDays: 1 })),
      provider({ name: "Z", outstandingNotes: 0, statusCoveragePercent: 50 }),
    ];
    const names = needsAttention(providers).items.map((i) => i.provider.name);
    expect(names).toEqual(["A", "B", "R0", "R1", "R2", "Z"]); // top 5 by volume, plus low coverage
  });

  it("caps the list but reports the total", () => {
    const many = Array.from({ length: 12 }, (_, i) => provider({ name: `P${i}`, outstandingNotes: 1, oldestOutstandingDays: 60 }));
    const { items, total } = needsAttention(many);
    expect(items).toHaveLength(ATTENTION_CRITERIA.maxItems);
    expect(total).toBe(12);
  });

  it("flags limited coverage but not missing coverage", () => {
    expect(hasLimitedCoverage(provider({ statusCoveragePercent: 74.8 }))).toBe(true);
    expect(hasLimitedCoverage(provider({ statusCoveragePercent: 99.1 }))).toBe(false);
    expect(hasLimitedCoverage(provider({ statusCoveragePercent: null }))).toBe(false);
  });
});
