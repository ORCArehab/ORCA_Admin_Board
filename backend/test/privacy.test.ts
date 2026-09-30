import { describe, expect, it } from "vitest";
import type { CellValue, SpreadsheetSnapshot } from "../src/integrations/google/sheets.js";
import { buildProviderDashboard } from "../src/services/providerDashboard.js";
import { buildDiscoveryReport } from "../src/sources/providerTracker/discoveryReport.js";
import { TODAY, serial, trackerConfig } from "./fixtures/providerTracker.js";

/**
 * Privacy regression tests: raw cell contents must never reach API responses, warnings
 * or discovery output. The only verbatim cell text allowed is the detected header row's
 * column labels (the purpose of discovery).
 */

const HEADER = ["VISIT DATE", "FACILITIES", "Billing sheet", "CONSULT NOTES", "PROGRESS NOTES", "TOTAL", "UPLOADED NOTES", "Face sheet", "REMARKS"];
const MRN = 987654321;

/** Deterministic pseudo-random "free text" made of tokens outside the workflow vocabulary. */
function randomTokens(seed: number, count: number): string[] {
  let x = seed;
  const next = () => ((x = (x * 1103515245 + 12345) % 2 ** 31), x);
  return Array.from({ length: count }, () =>
    Array.from({ length: 7 }, () => String.fromCharCode(97 + (next() % 26))).join("") + "Q", // "Q" suffix: never a vocabulary word
  );
}

function leakySnapshot(freeText: string[]): SpreadsheetSnapshot {
  const t = (i: number) => freeText[i % freeText.length]!;
  const rows: CellValue[][] = [
    [`LEAK-TITLE ${t(0)} Group Z`], // title row above the header
    HEADER,
    // Every column carries text that must not leak, in each code path:
    [serial("2026-09-01"), `LEAK-FAC ${t(1)} / LEAK-FAC2`, `LEAK-BILL ${t(2)} 9/1`, 1, 1, 2, `LEAK-UP ${t(3)} 9/2/26 uploaded`, `LEAK-FACE ${t(4)}`, `LEAK-REM ${t(5)}`], // UNEXPECTED_STATUS, MULTI_FACILITY
    [`LEAK-DATE ${t(6)}`, "Facility A", false, `LEAK-C ${t(7)}`, 0, 3, false, false, `LEAK-REM ${t(8)}`], // INVALID_DATE, INVALID_NUMBER
    [serial("2026-09-02"), "Facility A", MRN, 1, 0, 1, MRN, MRN, MRN], // identifiers typed into status columns
    [null, null, `LEAK-ORPHAN ${t(9)}`, null, null, null, `LEAK-ORPHAN2 ${t(10)}`], // STATUS_WITHOUT_DATA
    [serial("2026-09-03"), "Facility B", true, 1, 1, `LEAK-T ${t(11)}`, true, true, ""], // INVALID_NUMBER in TOTAL
  ];
  return {
    spreadsheetId: "privacy",
    title: "Tracker",
    fetchedAt: "2026-09-29T00:00:00.000Z",
    tabs: [
      { sheetId: 300, title: "JD", hidden: false, index: 0, values: rows },
      { sheetId: 700, title: "Notes", hidden: false, index: 1, values: [[`LEAK-NOTES ${t(12)}`], [`LEAK-NOTES2 ${t(13)}`, MRN]] },
    ],
  };
}

function assertNoLeak(output: string, freeText: string[]) {
  expect(output).not.toMatch(/LEAK-/);
  expect(output).not.toContain(String(MRN));
  for (const token of freeText) expect(output).not.toContain(token);
}

describe("privacy: raw cell contents never leak", () => {
  const config = trackerConfig({ providers: { "gid:300": "Jane Doe" }, excludeTabs: [] });

  for (const seed of [1, 42, 2026]) {
    const freeText = randomTokens(seed, 16);
    const snapshot = leakySnapshot(freeText);

    it(`dashboard payload and warnings (seed ${seed})`, () => {
      const dashboard = buildProviderDashboard(snapshot, config, { today: TODAY, timezone: "UTC", sourceLabel: "t" });
      // Coverage: the leaky rows really did go through the warning paths.
      const codes = new Set(dashboard.dataQuality.rowIssues.map((i) => i.code));
      for (const code of ["UNEXPECTED_STATUS", "MULTI_FACILITY", "INVALID_DATE", "INVALID_NUMBER", "STATUS_WITHOUT_DATA"]) expect(codes).toContain(code);
      assertNoLeak(JSON.stringify(dashboard), freeText);
    });

    it(`discovery report (seed ${seed})`, () => {
      const report = buildDiscoveryReport(snapshot, config, TODAY).join("\n");
      expect(report).toContain('"UPLOADED NOTES"'); // header labels are intentionally shown
      expect(report).toContain("uploaded"); // workflow keywords survive normalization
      assertNoLeak(report, freeText);
    });
  }

  it("masks over-long header labels in discovery output", () => {
    const snapshot = leakySnapshot(["x"]);
    snapshot.tabs[0]!.values[1] = [...HEADER, "LEAK-HEADER a very long cell that is not really a column label"];
    expect(buildDiscoveryReport(snapshot, config, TODAY).join("\n")).not.toContain("LEAK-HEADER");
  });
});
