import type { Metadata } from "next";
import { EmployeeScreen } from "@/components/org/RecordScreens";

export const metadata: Metadata = { title: "Employee · ORCA Admin" };

/** ?created=1 after "New employee" saves. */
export default async function EmployeePage({ params, searchParams }: PageProps<"/employees/[id]">) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  return <EmployeeScreen id={id} created={created === "1"} />;
}
