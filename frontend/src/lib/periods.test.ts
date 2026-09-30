import { describe, expect, it } from "vitest";
import { periodLabel } from "./periods";

const scope = { from: "2026-08-01", to: "2026-09-28" };

describe("period labels", () => {
  it("clips weeks and months to the reporting scope and marks them partial", () => {
    expect(periodLabel("2026-07-27", "weekly", scope)).toEqual({ label: "Aug 1 – Aug 2", partial: true });
    expect(periodLabel("2026-08-03", "weekly", scope)).toEqual({ label: "Aug 3 – Aug 9", partial: false });
    expect(periodLabel("2026-09-28", "weekly", scope)).toEqual({ label: "Sep 28", partial: true });
    expect(periodLabel("2026-08", "monthly", scope)).toEqual({ label: "August 2026", partial: false });
    expect(periodLabel("2026-09", "monthly", scope)).toEqual({ label: "Sep 1 – Sep 28", partial: true });
  });

  it("labels days with the weekday", () => {
    expect(periodLabel("2026-09-01", "daily", scope)).toEqual({ label: "Tue, Sep 1", partial: false });
  });
});
