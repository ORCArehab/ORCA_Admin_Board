import { describe, expect, it } from "vitest";
import type { CellValue } from "../../src/integrations/google/sheets.js";
import { buildScribeDashboard } from "../../src/services/scribeDashboard.js";
import { serial } from "../fixtures/providerTracker.js";
import { DAILY_HEADER, SCRIBE_TODAY, scribeConfig, scribeSnapshot, t } from "../fixtures/scribeTracker.js";

/**
 * Privacy regression: raw cell contents from Daily Production must never reach the scribe
 * payload. Allowed output: canonical scribe names (validated as names) and computed numbers.
 * Facility names are internal in V1 (reported only as counts).
 */
const MRN = 918273645;

function randomTokens(seed: number, count: number): string[] {
  let x = seed;
  const next = () => ((x = (x * 1103515245 + 12345) % 2 ** 31), x);
  return Array.from({ length: count }, () => Array.from({ length: 7 }, () => String.fromCharCode(97 + (next() % 26))).join("") + "Q");
}

function leakyRows(tok: string[]): CellValue[][] {
  const w = (i: number) => tok[i % tok.length]!;
  return [
    DAILY_HEADER,
    // Every text-capable column carries leaky content; numeric columns get identifier-like numbers where invalid.
    [serial("2026-09-01"), "Ann", t(8), null, null, t(16), t(8), `LEAK-FAC ${w(0)} / LEAK-FAC2`, `LEAK-DOS ${w(1)} 9/1`, 1, 2, 3, `LEAK-AVG ${w(2)}`, 4, `LEAK-EXTRA ${w(3)} ${MRN}`],
    [null, null, null, null, null, null, "", `LEAK-FAC3 ${w(4)}`, `LEAK-DOS2 ${w(5)}`, 0, `LEAK-P ${w(6)}`, 2, "", `LEAK-UP ${w(7)}`, MRN], // continuation with bad counts
    [serial("2026-09-02"), `LEAK ${w(8)} #${MRN}`, t(9), null, null, t(10), t(1), "Facility A", null, 0, 1, 1, "", null, null], // invalid scribe
    [`LEAK-DATE ${w(9)}`, "Ann", t(9), null, null, t(10), t(1), "Facility A", null, 0, 1, 1, "", null, null], // invalid date
    [serial("2026-09-03"), "Bea", `LEAK-TIME ${w(10)}`, null, null, t(10), MRN, "Facility A", null, `LEAK-C ${w(11)}`, 1, `LEAK-T ${w(12)}`, "", null, null], // bad time/hours/counts
    [null, null, null, null, null, null, "", null, null, null, null, 0, "", null, null],
    [null, null, `LEAK-ORPHAN ${w(13)}`, null, null, null, "", `LEAK-FAC4 ${w(14)}`, null, null, null, 0, "", null, null], // unattributed
  ];
}

describe("scribe privacy: raw cell contents never leak", () => {
  for (const seed of [7, 99, 2026]) {
    it(`payload and warnings (seed ${seed})`, () => {
      const tok = randomTokens(seed, 16);
      const d = buildScribeDashboard(scribeSnapshot(leakyRows(tok)), scribeConfig(), { today: SCRIBE_TODAY, timezone: "UTC", sourceLabel: "t" });
      const codes = new Set(d.dataQuality.rowIssues.map((i) => i.code));
      for (const c of ["INVALID_SCRIBE", "INVALID_DATE", "INVALID_TIME", "INVALID_HOURS", "INVALID_NUMBER", "UNATTRIBUTED_ROW", "INHERITED_ATTRIBUTION", "MULTI_FACILITY"]) {
        expect(codes).toContain(c);
      }
      const json = JSON.stringify(d);
      expect(json).not.toMatch(/LEAK/);
      expect(json).not.toContain(String(MRN));
      expect(json).not.toContain("Facility A"); // facility names are internal in V1
      for (const x of tok) expect(json).not.toContain(x);
      expect(d.scribes.map((s) => s.name)).toEqual(["Ann", "Bea"]); // validated names are the intended output
    });
  }
});
