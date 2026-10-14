import { describe, expect, it } from "vitest";
import { rankOptions } from "./search";

const facilities = [
  { id: "1", label: "Alpha Post Acute", detail: "APA", keywords: ["APA"] },
  { id: "2", label: "Beta Care Center", detail: "BCC", keywords: ["BCC"] },
  { id: "3", label: "Kaiser Pomona", keywords: [] },
  { id: "4", label: "Pomona Valley Hospital", keywords: [] },
  { id: "5", label: "Delta Rehabilitation", keywords: [] },
];

describe("rankOptions", () => {
  it("lists nothing until something is typed", () => {
    expect(rankOptions(facilities, "  ")).toEqual([]);
  });
  it("finds by any word, abbreviation or partial words, best first", () => {
    expect(rankOptions(facilities, "pomona").map((o) => o.id)).toEqual(["4", "3"]);
    expect(rankOptions(facilities, "ka po").map((o) => o.id)).toEqual(["3"]);
    expect(rankOptions(facilities, "apa").map((o) => o.id)).toEqual(["1"]);
    expect(rankOptions(facilities, "rehab").map((o) => o.id)).toEqual(["5"]);
    expect(rankOptions(facilities, "pom")[0]!.id).toBe("4");
  });
  it("ignores case and accents, and stops at the limit", () => {
    expect(rankOptions([{ id: "x", label: "José Núñez" }], "jose nun").map((o) => o.id)).toEqual(["x"]);
    const many = Array.from({ length: 30 }, (_, i) => ({ id: String(i), label: `Facility ${i}` }));
    expect(rankOptions(many, "facility")).toHaveLength(8);
  });
});
