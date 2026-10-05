import type { Metadata } from "next";
import { NewEmployeeScreen } from "@/components/org/RecordScreens";

export const metadata: Metadata = { title: "New employee · ORCA Admin" };

export default function NewEmployeePage() {
  return <NewEmployeeScreen />;
}
