import { describe, expect, it } from "vitest";
import { readProviderTracker } from "../../src/sources/providerTracker/index.js";
import { TODAY, serial, trackerConfig, trackerSnapshot } from "../fixtures/providerTracker.js";
import { buildAliasLookup, findHeaderRow } from "../../src/sources/providerTracker/columns.js";
import { parseProviderTab } from "../../src/sources/providerTracker/parseRows.js";

describe("provider row parsing", () => {
  const data = readProviderTracker(trackerSnapshot(), trackerConfig(), TODAY);
  const jane = data.rows.filter((r) => r.provider === "Jane Doe");
  const issuesAt = (row: number) => data.issues.filter((i) => i.tab === "JD" && i.row === row).map((i) => i.code);

  it("skips blank/template rows, section labels and repeated headers", () => {
    expect(jane.map((r) => r.row)).toEqual([3, 4, 5, 8, 9, 10, 11, 14]);
    expect(data.tabs.find((t) => t.title === "JD")).toMatchObject({ parsedRows: 8, skippedRows: 5, headerRow: 2 });
  });

  it("types values from serial dates, date strings and checkboxes", () => {
    expect(jane[0]).toMatchObject({ visitDate: "2026-09-01", total: 5, uploadedNotes: "checked", billingSheet: "checked", faceSheet: "checked" });
    expect(jane.find((r) => r.row === 8)?.visitDate).toBe("2026-09-20");
  });

  it("flags questionable rows without repairing them", () => {
    expect(issuesAt(8)).toEqual(["TOTAL_MISMATCH"]);
    expect(issuesAt(9)).toEqual(["INVALID_DATE"]);
    expect(jane.find((r) => r.row === 9)).toMatchObject({ visitDate: null, total: 2 });
    expect(issuesAt(10)).toEqual(["MISSING_TOTAL"]);
    expect(jane.find((r) => r.row === 10)?.total).toBeNull(); // not back-filled from components
    expect(issuesAt(11)).toEqual(["UNEXPECTED_STATUS"]);
    expect(jane.find((r) => r.row === 11)?.uploadedNotes).toBe("unrecognized");
  });

  it("flags rows with notes but no visit date", () => {
    expect(issuesAt(14)).toEqual(["MISSING_DATE"]);
    expect(issuesAt(12)).toEqual([]);
    expect(issuesAt(13)).toEqual([]);
  });

  it("marks multi-facility rows instead of splitting them", () => {
    expect(issuesAt(5)).toEqual(["MULTI_FACILITY"]);
    expect(jane.find((r) => r.row === 5)).toMatchObject({ multiFacility: true, facilities: "Facility A / Facility C", total: 6 });
  });

  it("records absent optional columns as null", () => {
    const bob = data.rows.filter((r) => r.provider === "Bob Smith");
    expect(bob[0]).toMatchObject({ billingSheet: null, faceSheet: null });
  });

  it("flags future dates, invalid numbers and blank upload status", () => {
    const values = [
      ["VISIT DATE", "TOTAL", "UPLOADED NOTES"],
      [serial("2026-10-15"), 1, false],
      [serial("2026-09-01"), "two", false],
      [serial("2026-09-02"), 3, null],
      [null, null, true],
    ];
    const header = findHeaderRow(values, buildAliasLookup(), 5)!;
    const result = parseProviderTab({ provider: "P", tab: "P", sheetId: 1, values, header, multiFacilitySeparators: ["/"], today: TODAY });
    expect(result.issues.map((i) => `${i.row}:${i.code}`)).toEqual([
      "2:FUTURE_DATE",
      "3:INVALID_NUMBER",
      "4:MISSING_STATUS",
      "5:STATUS_WITHOUT_DATA",
    ]);
  });
});
