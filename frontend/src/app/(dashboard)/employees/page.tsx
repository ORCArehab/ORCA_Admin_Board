import type { Metadata } from "next";
import { EmployeeList } from "@/components/org/EmployeeList";

export const metadata: Metadata = { title: "Employees · ORCA Admin" };

export default function EmployeesPage() {
  return <EmployeeList />;
}
