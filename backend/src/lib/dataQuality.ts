/**
 * Data-quality findings shared by all spreadsheet sources.
 *
 * - "structure" issues describe a tab/column problem (e.g. an expected provider tab
 *   lost a required column). These can make a provider's numbers incomplete.
 * - "row" issues describe a single questionable row. The row is flagged, never
 *   silently repaired; it is excluded only from the calculations it cannot support.
 *
 * Messages and values deliberately avoid free-text fields (e.g. REMARKS) that may
 * contain patient information.
 */
export type Severity = "error" | "warning" | "info";
export type IssueScope = "structure" | "row";

export interface DataQualityIssue {
  code: string;
  severity: Severity;
  scope: IssueScope;
  message: string;
  tab?: string;
  sheetId?: number;
  /** 1-based spreadsheet row number, as shown in Google Sheets. */
  row?: number;
  column?: string;
  provider?: string;
  scribe?: string;
  value?: string | number | boolean | null;
}

export function summarizeIssues(issues: DataQualityIssue[]): Record<string, number> {
  const byCode: Record<string, number> = {};
  for (const issue of issues) byCode[issue.code] = (byCode[issue.code] ?? 0) + 1;
  return byCode;
}
