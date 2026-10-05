import type { Metadata } from "next";
import { ScheduleScreen } from "@/components/schedule/ScheduleScreen";
import { isIsoDate, today, weekStart } from "@/lib/schedule/week";

export const metadata: Metadata = { title: "Schedule · ORCA Admin" };

/** A record id from the query string (only used to preselect a filter; the board ignores unknown ids). */
const recordId = (value: string | string[] | undefined) => (typeof value === "string" && /^[0-9a-f-]{8,64}$/i.test(value) ? value : null);

/**
 * Operations → Schedule. ?week=YYYY-MM-DD (any day of the week) opens that week.
 * ?provider=<staff id> or ?facility=<facility id> opens with that filter selected (used by the
 * "View schedule" links on employee and facility profiles).
 */
export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const { week, view, provider, facility } = await searchParams;
  const facilityId = recordId(facility);
  const now = today();
  return (
    <ScheduleScreen
      today={now}
      initialWeekStart={weekStart(typeof week === "string" && isIsoDate(week) ? week : now)}
      initialView={view === "facilities" || (facilityId && view !== "providers") ? "facilities" : "providers"}
      initialStaffId={recordId(provider)}
      initialFacilityId={facilityId}
    />
  );
}
