import type { Assignment, AssignmentType, FacilityRecord, TimeBlock } from "./types";

export const TYPE_LABELS: Record<AssignmentType, string> = {
  facility: "Facility",
  coverage: "Coverage",
  admin: "Admin",
  clinic: "Clinic",
  pto: "PTO",
  off: "Off",
};

export const TIME_LABELS: Record<TimeBlock, string> = { am: "AM", pm: "PM", all_day: "All day", custom: "Custom" };

/** 13:30 → "1:30p", 09:00 → "9a". */
export function shortTime(time: string): string {
  const [h, m] = time.split(":").map(Number) as [number, number];
  const suffix = h < 12 ? "a" : "p";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""}${suffix}`;
}

/** The time part of a chip: "AM", "PM", "9a–5p", or "" for all day. */
export function timeText(a: Pick<Assignment, "timeBlock" | "startTime" | "endTime">): string {
  if (a.timeBlock === "custom" && a.startTime && a.endTime) return `${shortTime(a.startTime)}–${shortTime(a.endTime)}`;
  return a.timeBlock === "all_day" ? "" : TIME_LABELS[a.timeBlock];
}

/** A facility's short label: its abbreviation where it has one. */
export function facilityShort(facility: FacilityRecord | undefined): string {
  if (!facility) return "Unknown facility";
  return facility.abbreviation || facility.name;
}

/** The main text of a chip in the provider view: "APA", "Cov · APA", "Admin", "PTO". */
export function entryLabel(a: Assignment, facility: FacilityRecord | undefined): string {
  if (a.type === "facility") return facilityShort(facility);
  if (a.type === "coverage") return `Cov · ${facilityShort(facility)}`;
  const base = TYPE_LABELS[a.type];
  return facility ? `${base} · ${facilityShort(facility)}` : base;
}
