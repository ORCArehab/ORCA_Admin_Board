import { describe, expect, it } from "vitest";
import { attachedSummary } from "./deleteFacility";

describe("why a facility can't be deleted", () => {
  it("lists what's attached, in plain words", () => {
    expect(attachedSummary({ assignments: 3, scheduleEntries: 12, hospitalLogins: 1 })).toBe("3 provider assignments, 12 schedule entries and 1 hospital login");
    expect(attachedSummary({ assignments: 0, scheduleEntries: 1, hospitalLogins: 0 })).toBe("1 schedule entry");
    expect(attachedSummary({ assignments: 1, scheduleEntries: 0, hospitalLogins: 2 })).toBe("1 provider assignment and 2 hospital logins");
    expect(attachedSummary(undefined)).toBe("history attached");
  });
});
