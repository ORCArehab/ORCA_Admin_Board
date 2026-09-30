import { describe, expect, it } from "vitest";
import { formatCount, formatDays, formatDecimal, formatPercent, providerHref } from "./format";

describe("format", () => {
  it("shows missing values as an em dash, never 0", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatDays(null)).toBe("—");
    expect(formatPercent(0)).toBe("0%");
  });

  it("formats numbers compactly", () => {
    expect(formatCount(12345)).toBe("12,345");
    expect(formatPercent(66.7)).toBe("66.7%");
    expect(formatPercent(100)).toBe("100%");
    expect(formatDays(1)).toBe("1 day");
    expect(formatDays(91)).toBe("91 days");
  });

  it("always shows one decimal for hours and rates", () => {
    expect(formatDecimal(8)).toBe("8.0");
    expect(formatDecimal(1234.56)).toBe("1,234.6");
    expect(formatDecimal(null)).toBe("—");
  });

  it("builds safe provider links", () => {
    expect(providerHref("Ann / Dr. Bo (shared tab)")).toBe("/providers/Ann%20%2F%20Dr.%20Bo%20(shared%20tab)");
  });
});
