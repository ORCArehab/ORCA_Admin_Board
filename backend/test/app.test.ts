import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { DisabledAuthenticator, isAllowed, type Authenticator } from "../src/auth/authenticator.js";
import { loadEnv } from "../src/config/env.js";
import { AppError } from "../src/lib/errors.js";
import { ProviderDashboardService } from "../src/services/providerDashboard.js";
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

describe("GET /api/dashboard/providers", () => {
  const app = buildApp({ authenticator: new DisabledAuthenticator(), providerDashboard: service() });
  afterAll(() => app.close());

  it("returns provider metrics", async () => {
    const res = await app.inject({ method: "GET", url: "/api/dashboard/providers" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta).toMatchObject({ completionBasis: "row-level-upload-flag", cached: false, asOfDate: "2026-09-29" });
    expect(body.providers[0]).toMatchObject({ name: "Jane Doe", outstandingNotes: 13, oldestOutstandingDays: 19 });
  });

  it("ignores unknown query parameters", async () => {
    const res = await app.inject({ method: "GET", url: "/api/dashboard/providers?foo=1" });
    expect(res.statusCode).toBe(200);
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
  const app = buildApp({ authenticator: denyAll, providerDashboard: service() });
  afterAll(() => app.close());

  it("blocks /api routes when authentication fails", async () => {
    const res = await app.inject({ method: "GET", url: "/api/dashboard/providers" });
    expect(res.statusCode).toBe(401);
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
