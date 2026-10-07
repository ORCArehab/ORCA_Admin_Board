import type { Metadata } from "next";
import { NewEmployeeScreen } from "@/components/org/RecordScreens";

export const metadata: Metadata = { title: "New employee · ORCA Admin" };

/** ?account=<email>&name=<name> when creating the record for a sign-in account (Accounts without a record). */
export default async function NewEmployeePage({ searchParams }: PageProps<"/employees/new">) {
  const { account, name } = await searchParams;
  return <NewEmployeeScreen account={typeof account === "string" ? { email: account, name: typeof name === "string" ? name : null } : null} />;
}
