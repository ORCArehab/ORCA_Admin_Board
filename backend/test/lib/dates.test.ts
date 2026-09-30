import { describe, expect, it } from "vitest";
import { daysBetween, fromSheetsSerial, parseDateString, todayInTimeZone } from "../../src/lib/dates.js";
import { serial } from "../fixtures/providerTracker.js";

describe("dates", () => {
  it("converts Sheets serial numbers to ISO dates", () => {
    expect(fromSheetsSerial(serial("2026-09-01"))).toBe("2026-09-01");
    expect(fromSheetsSerial(serial("2026-09-01") + 0.75)).toBe("2026-09-01"); // time portion ignored
    expect(fromSheetsSerial(5)).toBeNull(); // 1900: implausible for the tracker
  });

  it("parses supported date strings and rejects others", () => {
    expect(parseDateString("9/20/2026")).toBe("2026-09-20");
    expect(parseDateString("09/05/26")).toBe("2026-09-05");
    expect(parseDateString("2026-09-05")).toBe("2026-09-05");
    expect(parseDateString("2/30/2026")).toBeNull();
    expect(parseDateString("9/3-9/5")).toBeNull();
    expect(parseDateString("SEPTEMBER")).toBeNull();
  });

  it("computes day differences", () => {
    expect(daysBetween("2026-09-10", "2026-09-29")).toBe(19);
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2); // across DST change
  });

  it("uses the configured timezone for today", () => {
    const now = new Date("2026-09-30T03:00:00Z"); // still Sept 29 in Los Angeles
    expect(todayInTimeZone("America/Los_Angeles", now)).toBe("2026-09-29");
    expect(todayInTimeZone("UTC", now)).toBe("2026-09-30");
  });
});
