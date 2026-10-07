import type { Metadata } from "next";
import { PeopleScreen } from "@/components/PeopleScreen";

export const metadata: Metadata = { title: "People & Roles · ORCA Admin" };

/** Admins only: the proxy sends anyone else to their own home page, and the ORCA API checks again. */
export default function PeoplePage() {
  return <PeopleScreen />;
}
