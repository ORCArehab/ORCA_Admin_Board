/** One choice in a SearchPicker. `detail` is a second line (an email, an abbreviation). */
export interface PickerOption {
  id: string;
  label: string;
  detail?: string | null;
  /** Other text it can be found by (an abbreviation, a preferred name). */
  keywords?: string[];
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * The options best matching what was typed, best first: a name starting with it, then a word
 * starting with it, then containing it. Every typed word must appear somewhere ("ka po" finds
 * "Kaiser Pomona").
 */
export function rankOptions(options: PickerOption[], query: string, limit = 8): PickerOption[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: { option: PickerOption; score: number }[] = [];
  for (const option of options) {
    const haystack = fold([option.label, option.detail ?? "", ...(option.keywords ?? [])].join(" "));
    const tokens = haystack.split(/[^a-z0-9]+/).filter(Boolean);
    let score = 0;
    let ok = true;
    for (const w of words) {
      if (tokens.some((t) => t === w)) score += 3;
      else if (tokens.some((t) => t.startsWith(w))) score += 2;
      else if (haystack.includes(w)) score += 1;
      else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (fold(option.label).startsWith(words.join(" "))) score += 2;
    scored.push({ option, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.option.label.localeCompare(b.option.label))
    .slice(0, limit)
    .map((s) => s.option);
}
