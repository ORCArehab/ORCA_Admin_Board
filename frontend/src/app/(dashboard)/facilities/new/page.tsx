import type { Metadata } from "next";
import { NewFacilityScreen } from "@/components/org/RecordScreens";

export const metadata: Metadata = { title: "New facility · ORCA Admin" };

export default function NewFacilityPage() {
  return <NewFacilityScreen />;
}
