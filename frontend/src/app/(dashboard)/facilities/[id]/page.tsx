import type { Metadata } from "next";
import { FacilityScreen } from "@/components/org/RecordScreens";

export const metadata: Metadata = { title: "Facility · ORCA Admin" };

/** ?created=1 after "New facility" saves; ?tab= opens a tab (contacts, providers, scheduling, logins). */
export default async function FacilityPage({ params, searchParams }: PageProps<"/facilities/[id]">) {
  const [{ id }, { created, tab }] = await Promise.all([params, searchParams]);
  return <FacilityScreen id={id} created={created === "1"} tab={typeof tab === "string" ? tab : undefined} />;
}
