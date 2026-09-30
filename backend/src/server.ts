import { buildApp } from "./app.js";
import { createAuthenticator } from "./auth/authenticator.js";
import { loadEnv } from "./config/env.js";
import { loadProviderTrackerConfig, loadSheetSources } from "./config/sources.js";
import { createGoogleAuth } from "./integrations/google/auth.js";
import { GoogleSheetsReader } from "./integrations/google/sheets.js";
import { ProviderDashboardService } from "./services/providerDashboard.js";

/** Composition root: the only place env, Google auth and services are wired together. */
async function main() {
  const env = loadEnv();
  const sources = loadSheetSources(env);
  const allowedIds = Object.values(sources).map((s) => s.spreadsheetId);
  const reader = new GoogleSheetsReader(createGoogleAuth(), allowedIds);

  const app = buildApp(
    {
      authenticator: createAuthenticator(env),
      providerDashboard: new ProviderDashboardService({
        reader,
        source: sources.providerTracker,
        config: loadProviderTrackerConfig(env),
        timezone: env.DASHBOARD_TIMEZONE,
        cacheTtlMs: env.CACHE_TTL_SECONDS * 1000,
      }),
    },
    { logger: { level: env.LOG_LEVEL } },
  );

  if (!sources.providerTracker) app.log.warn("PROVIDER_TRACKER_SPREADSHEET_ID is not set; /api/dashboard/providers will return 503");
  if (env.AUTH_MODE === "disabled") app.log.warn("AUTH_MODE=disabled: API is unauthenticated (development only)");

  // Cloud Run needs 0.0.0.0; locally bind to loopback so an unauthenticated dev server isn't on the LAN.
  await app.listen({ port: env.PORT, host: env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1" });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
