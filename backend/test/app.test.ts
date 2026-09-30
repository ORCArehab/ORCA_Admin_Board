import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { DisabledAuthenticator, isAllowed, type Authenticator } from "../src/auth/authenticator.js";
import { loadEnv } from "../src/config/env.js";
import { AppError } from "../src/lib/errors.js";
import { ProviderDashboardService } from "../src/services/providerDashboard.js";
import { ScribeDashboardService } from "../src/services/scribeDashboard.js";
import { scribeConfig, scribeSnapshot } from "./fixtures/scribeTracker.js";
import { trackerConfig, trackerSnapshot } from "./fixtures/providerTracker.js";

function service() {
  return new ProviderDashboardService({
    reader: { readSpreadsheet: async () => trackerSnapshot() },
    source: { key: "providerTracker", label: "ORCA-NP/Scribe Tracker 2026", spreadsheetId: "test-sheet" },
    config: trackerConfig(),
    timezone: "America/Los_Angeles",
    cacheTtlMs: 60_000,
    now: () => new Date("2026-09-29T18:00:00Z"),
  });
}

function scribes() {
  return new ScribeDashboardService({
    reader: { readSpreadsheet: async () => scribeSnapshot() },
    source: { key: "scribeTracker", label: "ORCA-REMOWORKS-Scribe Tracker 2026", spreadsheetId: "scribe-test" },
    config: scribeConfig(),
    timezone: "America/Los_Angeles",
    cacheTtlMs: 60_000,
    now: () => new Date("2026-09-29T18:00:00Z"),
  });
}

describe("GET /api/dashboard/providers", () => {
  const app = buildApp({ authenticator: new DisabledAuthenticator(), providerDashboard: service(), scribeDashboard: scribes() });
  afterAll(() => app.close());

  it("returns provider metrics", async () => {
    const res = await app.inject({ method: "GET", url: "/api/dashboard/providers" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta).toMatchObject({ completionBasis: "row-level-upload-flag", cached: false, asOfDate: "2026-09-29" });
    expect(body.providers[0]).toMatchObject({ name: "Jane Doe", outstandingNotes: 15, oldestOutstandingDays: 19 });
  });

  it("ignores unknown query parameters", async () => {
    const res = await app.inject({ method: "GET", url: "/api/dashboard/providers?foo=1" });
    expect(res.statusCode).toBe(200);
  });

  it("serves scribe metrics at /api/dashboard/scribes", async () => {
    const res = await app.inject({ method: "GET", url: "/api/dashboard/scribes" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta).toMatchObject({ cached: false, scope: { sourceTab: "Daily Production", historyStartsOn: "2026-08-01" } });
    expect(body.scribes.map((s: { name: string }) => s.name)).toEqual(["Ann", "Bea"]);
  });

  it("serves an unauthenticated health check", async () => {
    expect((await app.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200);
  });
});

describe("API authentication", () => {
  const denyAll: Authenticator = {
    authenticate: async () => {
      throw new AppError(401, "UNAUTHENTICATED", "Missing IAP identity.");
    },
  };
  const app = buildApp({ authenticator: denyAll, providerDashboard: service(), scribeDashboard: scribes() });
  afterAll(() => app.close());

  it("blocks /api routes when authentication fails", async () => {
    const res = await app.inject({ method: "GET", url: "/api/dashboard/providers" });
    expect(res.statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/dashboard/scribes" })).statusCode).toBe(401);
    expect(res.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: "Missing IAP identity." } });
  });

  it("checks admin allowlists by domain or email", () => {
    const policy = { allowedDomains: ["orcarehab.com"], allowedEmails: ["contractor@gmail.com"] };
    expect(isAllowed("Admin@OrcaRehab.com", policy)).toBe(true);
    expect(isAllowed("contractor@gmail.com", policy)).toBe(true);
    expect(isAllowed("someone@gmail.com", policy)).toBe(false);
  });
});

describe("environment", () => {
  it("refuses disabled auth in production", () => {
    expect(() => loadEnv({ NODE_ENV: "production", AUTH_MODE: "disabled" })).toThrow(/AUTH_MODE/);
  });

  it("requires audience and allowlist for IAP", () => {
    expect(() => loadEnv({ AUTH_MODE: "iap" })).toThrow(/IAP_AUDIENCE/);
    expect(loadEnv({ AUTH_MODE: "iap", IAP_AUDIENCE: "/projects/1/global/backendServices/2", ADMIN_ALLOWED_DOMAINS: "orcarehab.com" }).AUTH_MODE).toBe("iap");
  });
});

describe("environment empty values", () => {
  it("treats empty values as unset", () => {
    const env = loadEnv({ PROVIDER_TRACKER_SPREADSHEET_ID: "", ORCA_SHARED_DRIVE_ID: "", IAP_AUDIENCE: "" });
    expect(env.PROVIDER_TRACKER_SPREADSHEET_ID).toBeUndefined();
    expect(env.ORCA_SHARED_DRIVE_ID).toBeUndefined();
  });
});
