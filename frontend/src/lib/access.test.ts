import { describe, expect, it } from "vitest";
import { canManageAccess, canManageFacilityAccess, canSee, canUseApp, homeFor, roleLabel, sectionForPath } from "./access";

describe("who can use ORCA Admin and see what", () => {
  it("lets Admin, HR and HIM in, nobody else", () => {
    expect(canUseApp(["ADMIN"])).toBe(true);
    expect(canUseApp(["HR"])).toBe(true);
    expect(canUseApp(["HIM"])).toBe(true);
    expect(canUseApp(["PROVIDER", "IT", "SCRIBE"])).toBe(false);
    expect(canUseApp([])).toBe(false);
  });

  it("gives HR Employees only; Admin everything", () => {
    for (const section of ["overview", "providers", "scribes", "schedule", "facilities", "people"] as const) {
      expect(canSee(["HR"], section)).toBe(false);
      expect(canSee(["ADMIN"], section)).toBe(true);
    }
    expect(canSee(["HR"], "employees")).toBe(true);
    expect(canSee(["ADMIN"], "employees")).toBe(true);
  });

  it("gives HIM Facilities only, including facility access", () => {
    for (const section of ["overview", "providers", "scribes", "schedule", "employees", "people"] as const) expect(canSee(["HIM"], section)).toBe(false);
    expect(canSee(["HIM"], "facilities")).toBe(true);
    expect(canManageFacilityAccess(["HIM"])).toBe(true);
    expect(canManageFacilityAccess(["ADMIN"])).toBe(true);
    expect(canManageFacilityAccess(["HR"])).toBe(false);
    expect(homeFor(["HIM"])).toBe("/facilities");
  });

  it("only admins set an employee's Category", () => {
    expect(canManageAccess(["ADMIN"])).toBe(true);
    expect(canManageAccess(["HR"])).toBe(false);
  });

  it("maps pages to sections and sends people to the first page they can see", () => {
    expect(sectionForPath("/")).toBe("overview");
    expect(sectionForPath("/employees/123")).toBe("employees");
    expect(sectionForPath("/schedule")).toBe("schedule");
    expect(sectionForPath("/people")).toBe("people");
    expect(sectionForPath("/something-else")).toBeNull();
    expect(homeFor(["ADMIN"])).toBe("/");
    expect(homeFor(["HR"])).toBe("/employees");
    expect(homeFor(["ADMIN", "HR"])).toBe("/");
  });

  it("labels roles for people, falling back to the key", () => {
    expect(roleLabel("PROVIDER")).toBe("Provider");
    expect(roleLabel("NEW_ROLE")).toBe("NEW_ROLE");
  });
});
