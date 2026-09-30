import { google, type sheets_v4 } from "googleapis";
import type { GoogleAuthClient } from "./auth.js";

/**
 * Thin, business-logic-free access to Google Sheets.
 * Returns raw cell values; interpretation happens in src/sources/*.
 */

/** Raw cell as returned with UNFORMATTED_VALUE: checkboxes → boolean, dates → serial number. */
export type CellValue = string | number | boolean | null;

export interface SheetTab {
  /** Stable numeric id ("gid"), survives tab renames. */
  sheetId: number;
  title: string;
  hidden: boolean;
  index: number;
}

export interface TabValues extends SheetTab {
  values: CellValue[][];
}

export interface SpreadsheetSnapshot {
  spreadsheetId: string;
  title: string;
  tabs: TabValues[];
  fetchedAt: string;
}

export interface SheetsReader {
  /** Reads every grid tab of an allowlisted spreadsheet. */
  readSpreadsheet(spreadsheetId: string): Promise<SpreadsheetSnapshot>;
}

export class SpreadsheetNotAllowedError extends Error {
  constructor(spreadsheetId: string) {
    super(`Spreadsheet ${spreadsheetId} is not in the source allowlist`);
    this.name = "SpreadsheetNotAllowedError";
  }
}

/** Quote a tab title for A1 notation: 'It''s a tab' */
export function quoteTabTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

export class GoogleSheetsReader implements SheetsReader {
  private readonly api: sheets_v4.Sheets;
  private readonly allowlist: ReadonlySet<string>;

  constructor(auth: GoogleAuthClient, allowedSpreadsheetIds: Iterable<string>) {
    this.api = google.sheets({ version: "v4", auth, retry: true });
    this.allowlist = new Set(allowedSpreadsheetIds);
  }

  async readSpreadsheet(spreadsheetId: string): Promise<SpreadsheetSnapshot> {
    if (!this.allowlist.has(spreadsheetId)) throw new SpreadsheetNotAllowedError(spreadsheetId);

    const meta = await this.api.spreadsheets.get({
      spreadsheetId,
      fields: "properties.title,sheets.properties(sheetId,title,hidden,index,sheetType)",
    });

    const tabs: SheetTab[] = (meta.data.sheets ?? [])
      .map((s) => s.properties)
      .filter((p): p is sheets_v4.Schema$SheetProperties => !!p && (p.sheetType ?? "GRID") === "GRID")
      .map((p) => ({
        sheetId: p.sheetId ?? -1,
        title: p.title ?? "",
        hidden: p.hidden ?? false,
        index: p.index ?? 0,
      }));

    const fetchedAt = new Date().toISOString();
    if (tabs.length === 0) {
      return { spreadsheetId, title: meta.data.properties?.title ?? "", tabs: [], fetchedAt };
    }

    const res = await this.api.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: tabs.map((t) => quoteTabTitle(t.title)),
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "SERIAL_NUMBER",
      majorDimension: "ROWS",
    });

    // valueRanges are returned in the same order as the requested ranges.
    const valueRanges = res.data.valueRanges ?? [];
    return {
      spreadsheetId,
      title: meta.data.properties?.title ?? "",
      fetchedAt,
      tabs: tabs.map((tab, i) => ({
        ...tab,
        values: (valueRanges[i]?.values ?? []) as CellValue[][],
      })),
    };
  }
}
