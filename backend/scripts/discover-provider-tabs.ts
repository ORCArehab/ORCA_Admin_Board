/**
 * Inspect the real provider tracker's structure so config can be written from facts.
 *
 *   npm run discover
 *
 * Prints ONLY structure: tab names, header rows, column mapping, value types and the
 * distinct values of checkbox/status columns. It never prints row contents, facilities,
 * remarks or anything that could contain patient information.
 */
import { loadEnv } from "../src/config/env.js";
import { loadProviderTrackerConfig, loadSheetSources } from "../src/config/sources.js";
import { createGoogleAuth } from "../src/integrations/google/auth.js";
import { GoogleSheetsReader, type CellValue } from "../src/integrations/google/sheets.js";
import { summarizeIssues } from "../src/lib/dataQuality.js";
import { todayInTimeZone } from "../src/lib/dates.js";
import { discoverProviderTabs } from "../src/sources/providerTracker/discoverTabs.js";
import { readProviderTracker } from "../src/sources/providerTracker/index.js";
import { normalizeFreeText, summarizeStatusTextPatterns } from "../src/sources/providerTracker/statusText.js";
import type { ProviderField } from "../src/sources/providerTracker/types.js";

const STATUS_FIELDS: ProviderField[] = ["uploadedNotes", "billingSheet", "faceSheet"];
const TYPED_FIELDS: ProviderField[] = ["visitDate", "total", "consultNotes", "progressNotes"];

function typeOf(v: CellValue | undefined): string {
  if (v === null || v === undefined || v === "") return "blank";
  return typeof v;
}

async function main() {
  const env = loadEnv();
  const source = loadSheetSources(env).providerTracker;
  if (!source) throw new Error("Set PROVIDER_TRACKER_SPREADSHEET_ID in .env first.");
  const config = loadProviderTrackerConfig(env);

  const reader = new GoogleSheetsReader(createGoogleAuth(), [source.spreadsheetId]);
  const snapshot = await reader.readSpreadsheet(source.spreadsheetId);
  const discovery = discoverProviderTabs(snapshot.tabs, config);

  console.log(`\nSpreadsheet: ${snapshot.title}`);
  console.log(`Tabs: ${snapshot.tabs.length}\n`);

  for (const c of discovery.tabs) {
    const values = snapshot.tabs.find((t) => t.sheetId === c.tab.sheetId)?.values ?? [];
    console.log(`── "${c.tab.title}"  gid:${c.tab.sheetId}${c.tab.hidden ? "  (hidden)" : ""}`);
    console.log(`   status: ${c.status}${c.providerName ? `  → provider "${c.providerName}" (${c.nameSource})` : ""}`);
    console.log(`   rows: ${values.length}`);
    if (!c.header) {
      console.log("   header: none found\n");
      continue;
    }
    const headerCells = values[c.header.rowIndex] ?? [];
    const mappedCols = new Set(Object.values(c.header.columns));
    console.log(`   header row: ${c.header.rowIndex + 1}`);
    for (const [field, col] of Object.entries(c.header.columns)) {
      console.log(`     ${field.padEnd(14)} ← col ${col + 1} "${c.header.headerText[field as ProviderField]}"`);
    }
    const unmapped = headerCells
      .map((h, i) => ({ h: String(h ?? "").trim(), i }))
      .filter(({ h, i }) => h && !mappedCols.has(i));
    if (unmapped.length) console.log(`   other headers: ${unmapped.map(({ h, i }) => `col ${i + 1} "${h}"`).join(", ")}`);
    if (c.missingColumns?.length) console.log(`   missing required: ${c.missingColumns.join(", ")}`);

    const dataRows = values.slice(c.header.rowIndex + 1);
    for (const field of TYPED_FIELDS) {
      const col = c.header.columns[field];
      if (col === undefined) continue;
      const counts: Record<string, number> = {};
      for (const r of dataRows) counts[typeOf(r[col])] = (counts[typeOf(r[col])] ?? 0) + 1;
      console.log(`   ${field} value types: ${JSON.stringify(counts)}`);
    }
    for (const field of STATUS_FIELDS) {
      const col = c.header.columns[field];
      if (col === undefined) continue;
      const distinct = new Map<string, number>();
      for (const r of dataRows) {
        const v = r[col];
        const key = typeof v === "string" && v.trim() ? `text: "${normalizeFreeText(v)}"` : JSON.stringify(v ?? null);
        distinct.set(key, (distinct.get(key) ?? 0) + 1);
      }
      const shown = [...distinct].sort((a, b) => b[1] - a[1]).slice(0, 15);
      const more = distinct.size > shown.length ? ` … +${distinct.size - shown.length} more` : "";
      console.log(`   ${field} distinct values: ${shown.map(([k, n]) => `${k}×${n}`).join(", ")}${more}`);
    }
    console.log();
  }

  const tracker = readProviderTracker(snapshot, config, todayInTimeZone(env.DASHBOARD_TIMEZONE));
  console.log("Normalized free-text patterns in status columns (rows / notes):");
  for (const p of summarizeStatusTextPatterns(tracker.rows)) console.log(`  ${p.column.padEnd(13)} ${String(p.rows).padStart(4)} / ${String(p.notes).padStart(5)}  ${p.pattern}`);

  console.log("Data-quality summary:", summarizeIssues(tracker.issues));
  for (const issue of tracker.issues.filter((i) => i.scope === "structure")) {
    console.log(`  [${issue.severity}] ${issue.code}: ${issue.message}`);
  }

  const suggestion = {
    providers: Object.fromEntries(
      discovery.tabs.filter((c) => c.status === "provider").map((c) => [`gid:${c.tab.sheetId}`, c.providerName]),
    ),
    excludeTabs: [],
  };
  console.log("\nStarter config/provider-tracker.json (edit provider names to canonical names):");
  console.log(JSON.stringify(suggestion, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
