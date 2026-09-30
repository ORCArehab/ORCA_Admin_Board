/**
 * Inspect the real provider tracker's structure so config can be written from facts.
 *
 *   npm run discover
 *
 * Prints ONLY structure (see buildDiscoveryReport for the privacy contract): tab names,
 * header rows, column mapping, value types and normalized status patterns. Never row
 * contents, facilities, remarks or free text verbatim.
 */
import { loadEnv } from "../src/config/env.js";
import { loadProviderTrackerConfig, loadSheetSources } from "../src/config/sources.js";
import { createGoogleAuth } from "../src/integrations/google/auth.js";
import { GoogleSheetsReader } from "../src/integrations/google/sheets.js";
import { todayInTimeZone } from "../src/lib/dates.js";
import { buildDiscoveryReport } from "../src/sources/providerTracker/discoveryReport.js";

async function main() {
  const env = loadEnv();
  const source = loadSheetSources(env).providerTracker;
  if (!source) throw new Error("Set PROVIDER_TRACKER_SPREADSHEET_ID in .env first.");
  const reader = new GoogleSheetsReader(createGoogleAuth(), [source.spreadsheetId]);
  const snapshot = await reader.readSpreadsheet(source.spreadsheetId);
  const report = buildDiscoveryReport(snapshot, loadProviderTrackerConfig(env), todayInTimeZone(env.DASHBOARD_TIMEZONE));
  console.log(report.join("\n"));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
