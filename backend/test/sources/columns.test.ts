import { describe, expect, it } from "vitest";
import { buildAliasLookup, findHeaderRow, normalizeHeader } from "../../src/sources/providerTracker/columns.js";

describe("column mapping", () => {
  it("normalizes header spelling differences", () => {
    expect(normalizeHeader("Face sheet")).toBe(normalizeHeader("FACESHEET"));
    expect(normalizeHeader(" Uploaded-Notes ")).toBe("UPLOADEDNOTES");
  });

  it("finds the header row below a title row", () => {
    const values = [["PROVIDER X 2026"], ["VISIT DATE", "Facilities", "TOTAL", "Uploaded Notes", "Face Sheet"], [1, "A", 2, true, false]];
    const header = findHeaderRow(values, buildAliasLookup(), 10);
    expect(header?.rowIndex).toBe(1);
    expect(header?.columns).toEqual({ visitDate: 0, facilities: 1, total: 2, uploadedNotes: 3, faceSheet: 4 });
  });

  it("does not treat a lone TOTAL label as a header", () => {
    expect(findHeaderRow([["TOTAL", 55]], buildAliasLookup(), 10)).toBeNull();
  });

  it("accepts extra aliases from config", () => {
    const lookup = buildAliasLookup({ uploadedNotes: ["NOTES IN EMR"] });
    const header = findHeaderRow([["VISIT DATE", "TOTAL", "Notes in EMR"]], lookup, 10);
    expect(header?.columns.uploadedNotes).toBe(2);
  });
});
