import { describe, expect, it } from "vitest";
import { countyLabel, mapsUrl, missingKeyRoles, phoneDisplay, sortContacts } from "./contacts";
import type { FacilityContact } from "./types";

const c = (role: string, name: string | null = null, extra: Partial<FacilityContact> = {}): FacilityContact => ({ id: role + name, role, name, title: null, phone: null, email: null, ...extra });

describe("facility contacts", () => {
  it("lists standard roles in their usual order, then the rest", () => {
    expect(sortContacts([c("Payroll"), c("DOR"), c("IT/EHR"), c("Administrator"), c("DON", "Bea"), c("DON", "Al")]).map((x) => `${x.role}${x.name ?? ""}`)).toEqual([
      "Administrator",
      "DONAl",
      "DONBea",
      "DOR",
      "IT/EHR",
      "Payroll",
    ]);
  });

  it("suggests the key roles nobody is recorded for, matching loosely", () => {
    expect(missingKeyRoles([c("don"), c("IT/EHR")])).toEqual(["Administrator", "DOR"]);
    expect(missingKeyRoles([])).toEqual(["Administrator", "DON", "DOR", "IT / EHR"]);
  });

  it("formats phones with extensions and links that dial them", () => {
    expect(phoneDisplay(c("DON", null, { phone: "(555) 010-0400", extension: "204" }))).toEqual({ text: "(555) 010-0400 ext. 204", href: "tel:5550100400,204" });
    expect(phoneDisplay(c("DON", null, { phone: "555.010.0400" }))).toEqual({ text: "555.010.0400", href: "tel:5550100400" });
    expect(phoneDisplay(c("DON"))).toBeNull();
    expect(mapsUrl(["1 Main St", "Seaside, CA 90001"])).toBe("https://www.google.com/maps/search/?api=1&query=1%20Main%20St%2C%20Seaside%2C%20CA%2090001");
  });
});

describe("county", () => {
  it("never doubles the word County", () => {
    expect(countyLabel("Orange County")).toBe("Orange County");
    expect(countyLabel("Orange")).toBe("Orange County");
  });
});
