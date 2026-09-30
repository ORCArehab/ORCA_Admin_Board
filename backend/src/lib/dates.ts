/**
 * Calendar-date helpers. Dates are handled as ISO "YYYY-MM-DD" strings so that
 * timezone offsets never shift a visit onto a different day.
 */

export type IsoDate = string;

const MS_PER_DAY = 86_400_000;
/** Google Sheets / Lotus serial-date epoch: serial 0 = 1899-12-30. */
const SHEETS_EPOCH_UTC = Date.UTC(1899, 11, 30);

/** Plausibility bounds for tracker dates; anything outside is treated as unreadable. */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

function toIso(year: number, month: number, day: number): IsoDate | null {
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Reject rollovers such as 2/30 → 3/2.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

export function fromSheetsSerial(serial: number): IsoDate | null {
  if (!Number.isFinite(serial)) return null;
  const d = new Date(SHEETS_EPOCH_UTC + Math.floor(serial) * MS_PER_DAY);
  return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Accepts YYYY-MM-DD, M/D/YYYY and M/D/YY. Anything else (ranges, words) → null. */
export function parseDateString(input: string): IsoDate | null {
  const s = input.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return toIso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = Number(m[3]);
    return toIso(y < 100 ? 2000 + y : y, Number(m[1]), Number(m[2]));
  }
  return null;
}

/** Today's calendar date in the given IANA timezone. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): IsoDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}
