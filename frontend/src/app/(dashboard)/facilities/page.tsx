import type { Metadata } from "next";
import { FacilityList } from "@/components/org/FacilityList";

export const metadata: Metadata = { title: "Facilities · ORCA Admin" };

export default function FacilitiesPage() {
  return <FacilityList />;
}
