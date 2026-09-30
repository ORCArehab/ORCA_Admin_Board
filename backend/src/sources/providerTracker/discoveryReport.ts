import type { ProviderTrackerConfig } from "../../config/sources.js";
import type { CellValue, SpreadsheetSnapshot } from "../../integrations/google/sheets.js";
import { summarizeIssues } from "../../lib/dataQuality.js";
import type { IsoDate } from "../../lib/dates.js";
import { discoverProviderTabs } from "./discoverTabs.js";
import { readProviderTracker } from "./index.js";
import { normalizeFreeText, summarizeStatusTextPatterns } from "./statusText.js";
import type { ProviderField } from "./types.js";

const STATUS_FIELDS: ProviderField[] = ["uploadedNotes", "billingSheet", "faceSheet"];
const TYPED_FIELDS: ProviderField[] = ["visitDate", "total", "consultNotes", "progressNotes"];
/** Header labels longer than this are masked; real column labels are short. */
const MAX_HEADER_LABEL = 40;

function typeOf(v: CellValue | undefined): string {
  if (v === null || v === undefined || v === "") return "blank";
  return typeof v;
}

/**
 * Structure-only discovery report for the provider tracker (used by `npm run discover`).
 *
 * Privacy contract (covered by tests): the only cell text ever printed verbatim is the
 * detected header row's column labels, which is the purpose of discovery. Data rows, title
 * rows, facilities, remarks and free-text statuses never appear verbatim. Status values are
 * shown as TRUE/FALSE/blank or a normalized pattern; other columns only as value types.
 */
export function buildDiscoveryReport(snapshot: SpreadsheetSnapshot, config: ProviderTrackerConfig, today: IsoDate): string[] {
  const out: string[] = [];
  const discovery = discoverProviderTabs(snapshot.tabs, config);
  const label = (v: CellValue | undefined) => {
    const s = String(v ?? "").trim();
    return s.length > MAX_HEADER_LABEL ? `<label ${s.length} chars>` : s;
  };

  out.push(`Spreadsheet: ${snapshot.title}`, `Tabs: ${snapshot.tabs.length}`, "");

  for (const c of discovery.tabs) {
    const values = snapshot.tabs.find((t) => t.sheetId === c.tab.sheetId)?.values ?? [];
    out.push(`── "${c.tab.title}"  gid:${c.tab.sheetId}${c.tab.hidden ? "  (hidden in Sheets)" : ""}`);
    out.push(`   status: ${c.status}${c.providerName ? `  → provider "${c.providerName}" (${c.nameSource})` : ""}`);
    out.push(`   rows: ${values.length}`);
    if (!c.header) {
      out.push("   header: none found", "");
      continue;
    }
    const headerCells = values[c.header.rowIndex] ?? [];
    const mappedCols = new Set(Object.values(c.header.columns));
    out.push(`   header row: ${c.header.rowIndex + 1}`);
    for (const [field, col] of Object.entries(c.header.columns)) {
      out.push(`     ${field.padEnd(14)} ← col ${col + 1} "${label(headerCells[col])}"`);
    }
    const unmapped = headerCells
      .map((h, i) => ({ h: label(h), i }))
      .filter(({ h, i }) => h && !mappedCols.has(i));
    if (unmapped.length) out.push(`   other headers: ${unmapped.map(({ h, i }) => `col ${i + 1} "${h}"`).join(", ")}`);
    if (c.missingColumns?.length) out.push(`   missing required: ${c.missingColumns.join(", ")}`);

    const dataRows = values.slice(c.header.rowIndex + 1);
    for (const field of TYPED_FIELDS) {
      const col = c.header.columns[field];
      if (col === undefined) continue;
      const counts: Record<string, number> = {};
      for (const r of dataRows) counts[typeOf(r[col])] = (counts[typeOf(r[col])] ?? 0) + 1;
      out.push(`   ${field} value types: ${JSON.stringify(counts)}`);
    }
    for (const field of STATUS_FIELDS) {
      const col = c.header.columns[field];
      if (col === undefined) continue;
      const distinct = new Map<string, number>();
      for (const r of dataRows) {
        const v = r[col];
        const key =
          typeof v === "string" && v.trim()
            ? `text: "${normalizeFreeText(v)}"`
            : typeof v === "boolean" || v === null || v === undefined || v === ""
              ? JSON.stringify(v ?? null)
              : `<${typeof v}>`;
        distinct.set(key, (distinct.get(key) ?? 0) + 1);
      }
      const shown = [...distinct].sort((a, b) => b[1] - a[1]).slice(0, 15);
      const more = distinct.size > shown.length ? ` … +${distinct.size - shown.length} more` : "";
      out.push(`   ${field} distinct values: ${shown.map(([k, n]) => `${k}×${n}`).join(", ")}${more}`);
    }
    out.push("");
  }

  const tracker = readProviderTracker(snapshot, config, today);
  out.push("Normalized free-text patterns in status columns (rows / notes):");
  for (const p of summarizeStatusTextPatterns(tracker.rows)) {
    out.push(`  ${p.column.padEnd(13)} ${String(p.rows).padStart(4)} / ${String(p.notes).padStart(5)}  ${p.pattern}`);
  }
  out.push("", `Data-quality summary: ${JSON.stringify(summarizeIssues(tracker.issues))}`);
  for (const issue of tracker.issues.filter((i) => i.scope === "structure")) out.push(`  [${issue.severity}] ${issue.code}: ${issue.message}`);

  const suggestion = {
    providers: Object.fromEntries(discovery.tabs.filter((c) => c.status === "provider").map((c) => [`gid:${c.tab.sheetId}`, c.providerName])),
    excludeTabs: [],
  };
  out.push("", "Starter config/provider-tracker.json (edit provider names to canonical names):", JSON.stringify(suggestion, null, 2));
  return out;
}
