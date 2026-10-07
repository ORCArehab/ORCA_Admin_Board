import { describe, expect, it } from "vitest";
import { accessStamps } from "./accessStamps";

const base = { username: "ecc.akim", hasPassword: true, usernameSetAt: null, usernameSetBy: null, usernameSetVia: null, passwordSetAt: null, passwordSetBy: null, passwordSetVia: null };

describe("PCC change stamps", () => {
  it("says who changed the username and password, when, and from which app", () => {
    const stamps = accessStamps({
      ...base,
      usernameSetAt: "2026-10-07T19:00:00Z",
      usernameSetBy: "kim@orcarehab.com",
      usernameSetVia: "portal",
      passwordSetAt: "2026-10-06T18:00:00Z",
      passwordSetBy: "him@orcarehab.com",
      passwordSetVia: "admin",
    });
    expect(stamps).toEqual([
      { text: "Username set Oct 7, 2026 by kim@orcarehab.com (the provider, in the employee portal)", byProvider: true },
      { text: "Password set Oct 6, 2026 by him@orcarehab.com in ORCA Admin", byProvider: false },
    ]);
  });

  it("leaves out what isn't saved or isn't known", () => {
    expect(accessStamps({ ...base, username: null, hasPassword: false, usernameSetAt: "2026-10-07T19:00:00Z" })).toEqual([]);
    expect(accessStamps({ ...base, passwordSetAt: "2026-10-06T18:00:00Z", passwordSetBy: "tech@orcarehab.com" })).toEqual([
      { text: "Password set Oct 6, 2026 by tech@orcarehab.com", byProvider: false },
    ]);
  });
});
