import type { Metadata } from "next";
import { EmployeeList } from "@/components/org/EmployeeList";

export const metadata: Metadata = { title: "Employees · ORCA Admin" };

/** ?view=accounts opens Accounts without a record (admins). */
export default async function EmployeesPage({ searchParams }: PageProps<"/employees">) {
  const { view } = await searchParams;
  return <EmployeeList initialView={view === "accounts" ? "accounts" : "employees"} />;
}
