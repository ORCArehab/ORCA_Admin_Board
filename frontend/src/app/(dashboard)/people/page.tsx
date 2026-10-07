import { redirect } from "next/navigation";

/** People & Roles is now part of Employees: Access on each profile, and Accounts without a record. */
export default function PeoplePage() {
  redirect("/employees?view=accounts");
}
