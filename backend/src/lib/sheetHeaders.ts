import type { CellValue } from "../integrations/google/sheets.js";

/** Header matching ignores case, spaces and punctuation: "Face sheet" = "FACESHEET" = "Face-Sheet". */
export function normalizeHeader(value: CellValue | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Cell is empty (null, missing or whitespace-only text). */
export function isBlank(v: CellValue | undefined): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}
