import type { SheetTab } from "../integrations/google/sheets.js";

/** Does a config tab reference ("Tab Title" or "gid:123") point at this tab? gid refs survive renames. */
export function tabRefMatches(ref: string, tab: Pick<SheetTab, "title" | "sheetId">): boolean {
  const trimmed = ref.trim();
  if (trimmed.toLowerCase().startsWith("gid:")) return trimmed.slice(4).trim() === String(tab.sheetId);
  return trimmed === tab.title.trim();
}
