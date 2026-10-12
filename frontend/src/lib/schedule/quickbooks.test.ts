import { describe, expect, it } from "vitest";
import { connectOutcome, needsConnection, previewLines, previewNotes, resultLine } from "./quickbooks";

const summary = (o: Partial<Record<"create" | "update" | "remove" | "unchanged" | "notSent" | "blocked", number>> = {}) => ({ create: 0, update: 0, remove: 0, unchanged: 0, notSent: 0, blocked: 0, ...o });

describe("send to QuickBooks Time", () => {
  it("says plainly what will happen, with singular and plural", () => {
    expect(previewLines(summary({ create: 12, update: 1, remove: 2 }))).toEqual([
      "12 new events will be added as drafts",
      "1 event will be updated",
      "2 events will be removed (their entries are no longer on the schedule)",
    ]);
    expect(previewLines(summary({ create: 1 }))).toEqual(["1 new event will be added as a draft"]);
    expect(previewLines(summary({ unchanged: 5 }))).toEqual([]);
  });

  it("explains what isn't sent", () => {
    expect(previewNotes(summary({ unchanged: 5, blocked: 1, notSent: 3 }))).toEqual([
      "5 events already up to date",
      "1 entry waiting on a match below",
      "3 PTO, Off, Admin or Clinic entries not sent (they stay in ORCA)",
    ]);
  });

  it("sums up a send", () => {
    const base = { weekStart: "2026-10-12", unchanged: 0, blocked: 0, notSent: 0, failures: [] };
    expect(resultLine({ ...base, created: 4, updated: 1, removed: 0 })).toBe("Sent to QuickBooks Time: 4 added, 1 updated.");
    expect(resultLine({ ...base, created: 0, updated: 0, removed: 0 })).toBe("QuickBooks Time already matched this week. Nothing was changed.");
  });

  it("knows when to offer Connect, and reports how connecting went", () => {
    expect([needsConnection("NOT_CONNECTED"), needsConnection("RECONNECT"), needsConnection("RATE_LIMITED")]).toEqual([true, true, false]);
    expect(connectOutcome("connected")).toMatch(/is connected/);
    expect(connectOutcome("declined")).toMatch(/wasn't approved/);
    expect(connectOutcome(null)).toBeNull();
  });
});
