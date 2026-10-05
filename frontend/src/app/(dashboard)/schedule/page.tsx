import type { Metadata } from "next";
import { ScheduleScreen } from "@/components/schedule/ScheduleScreen";
import { isIsoDate, today, weekStart } from "@/lib/schedule/week";

export const metadata: Metadata = { title: "Schedule · ORCA Admin" };

/** Operations → Schedule. ?week=YYYY-MM-DD (any day of the week) opens that week. */
export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const { week, view } = await searchParams;
  const now = today();
  return (
    <ScheduleScreen
      today={now}
      initialWeekStart={weekStart(typeof week === "string" && isIsoDate(week) ? week : now)}
      initialView={view === "facilities" ? "facilities" : "providers"}
    />
  );
}
