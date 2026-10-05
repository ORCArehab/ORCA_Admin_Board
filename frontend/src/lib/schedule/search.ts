import { isProvider } from "./board";
import { TYPE_LABELS } from "./format";
import type { AssignmentType, FacilityRecord, StaffRecord } from "./types";

/**
 * Search for quick add's autocomplete: find a provider or facility by any part of any name it
 * goes by (display, preferred, first/last, abbreviation, aliases), ranked so the obvious match
 * is first and Enter takes it. "chel" → Chelsea Gainor, "AT" → AT — Anaheim Terrace,
 * "garden" → GP — Garden Park.
 */

export type PickKind = "staff" | "facility" | "special";

export interface SearchOption {
  kind: PickKind;
  /** Staff or facility id; for "special", the assignment type. */
  id: string;
  label: string;
  detail?: string;
  /** Searchable names, most important first; terms[0] is the label's own name. */
  terms: string[];
  /** Tie-break group: lower comes first (providers before other staff, active facilities first). */
  group: number;
}

export interface SearchResult {
  option: SearchOption;
  /** The other name that matched, when it wasn't the main one ("Chel", "Garden Park West"). */
  matched: string | null;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/** Letters and digits only, so "C.C.R.C." and "ccrc" match (as the API's alias keys do). */
const key = (s: string) => fold(s).replace(/[^a-z0-9]/g, "");

/** " word word " form, so "contains these words" can't match inside a longer word. */
const words = (s: string) => ` ${fold(s).split(/[^a-z0-9]+/).filter(Boolean).join(" ")} `;

/** 0 exact, 1 starts with, 2 a word starts with, 3 contains; null if no match. */
function score(term: string, query: string, queryKey: string): number | null {
  const text = fold(term);
  const textKey = key(term);
  if (queryKey && textKey === queryKey) return 0;
  if (text.startsWith(query) || (queryKey && textKey.startsWith(queryKey))) return 1;
  if (text.split(/[^a-z0-9]+/).some((word) => word.startsWith(query))) return 2;
  if (text.includes(query) || (queryKey.length >= 2 && textKey.includes(queryKey))) return 3;
  return null;
}

export function searchOptions(options: SearchOption[], rawQuery: string, limit = 8): SearchResult[] {
  const query = fold(rawQuery).trim();
  const byOrder = (a: SearchOption, b: SearchOption) => a.group - b.group || a.label.localeCompare(b.label);
  if (!query) return [...options].sort(byOrder).slice(0, limit).map((option) => ({ option, matched: null }));

  const queryKey = key(query);
  const scored: { option: SearchOption; score: number; matched: string | null }[] = [];
  for (const option of options) {
    let best: { score: number; index: number } | null = null;
    option.terms.forEach((term, index) => {
      const s = score(term, query, queryKey);
      if (s !== null && (!best || s < best.score)) best = { score: s, index };
    });
    if (best) {
      const { score: s, index } = best;
      // Only call out a name the label doesn't already show as whole words ("Liz" isn't shown by "Elizabeth").
      const term = option.terms[index]!;
      scored.push({ option, score: s, matched: index === 0 || words(option.label).includes(words(term)) ? null : term });
    }
  }
  return scored
    .sort((a, b) => a.score - b.score || byOrder(a.option, b.option))
    .slice(0, limit)
    .map(({ option, matched }) => ({ option, matched }));
}

const CATEGORY_DETAIL: Record<string, string> = { physician: "Physician", np_pa: "NP / PA", scribe: "Scribe" };

/** Everyone who can be scheduled, providers first. Separated staff aren't offered. */
export function staffOptions(staff: StaffRecord[], exclude?: string | null): SearchOption[] {
  return staff
    .filter((s) => s.employmentStatus !== "separated" && s.id !== exclude)
    .map((s) => ({
      kind: "staff" as const,
      id: s.id,
      label: s.displayName,
      detail: CATEGORY_DETAIL[s.category] ?? "Staff",
      terms: [
        s.displayName,
        ...(s.preferredName && s.lastName ? [`${s.preferredName} ${s.lastName}`] : []),
        ...(s.preferredName ? [s.preferredName] : []),
        ...(s.firstName ? [s.firstName] : []),
        ...(s.lastName ? [s.lastName] : []),
        ...(s.aliases ?? []),
      ],
      group: isProvider(s) ? 0 : 1,
    }));
}

/** Facilities by abbreviation, name or alias. Inactive ones stay selectable, after the rest. */
export function facilityOptions(facilities: FacilityRecord[]): SearchOption[] {
  return facilities.map((f) => ({
    kind: "facility" as const,
    id: f.id,
    label: f.abbreviation ? `${f.abbreviation} — ${f.name}` : f.name,
    detail: [f.city, f.operationalStatus === "inactive" ? "Inactive" : f.operationalStatus === "prospective" ? "Prospective" : null].filter(Boolean).join(" · ") || undefined,
    terms: [...(f.abbreviation ? [f.abbreviation] : []), f.name, ...(f.aliases ?? [])],
    group: f.operationalStatus === "inactive" || f.operationalStatus === "prospective" ? 1 : 0,
  }));
}

/** Entries with no facility, typed straight into the provider view's facility box: "pto" + Enter. */
export const SPECIAL_TYPES = ["pto", "off", "admin", "clinic"] as const satisfies readonly AssignmentType[];
export type SpecialType = (typeof SPECIAL_TYPES)[number];

const SPECIAL_TERMS: Record<SpecialType, string[]> = {
  pto: ["PTO", "Paid time off", "Vacation"],
  off: ["Off", "Day off"],
  admin: ["Admin", "Administrative"],
  clinic: ["Clinic"],
};

export function specialOptions(): SearchOption[] {
  return SPECIAL_TYPES.map((type) => ({
    kind: "special" as const,
    id: type,
    label: TYPE_LABELS[type],
    detail: type === "pto" || type === "off" ? "Not working" : "No facility",
    terms: SPECIAL_TERMS[type],
    group: 2,
  }));
}
