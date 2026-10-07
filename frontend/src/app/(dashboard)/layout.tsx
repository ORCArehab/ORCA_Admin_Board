import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Nav } from "@/components/Nav";
import { RolesProvider } from "@/components/RolesProvider";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  // The proxy already redirects signed-out visitors; this also catches a session that just ended.
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/sign-in" });
  }

  return (
    <RolesProvider roles={session.user.roles ?? []}>
      <div className="shell">
        <Nav userLabel={session.user.name || session.user.email} signOutAction={signOutAction} />
        <main className="main">{children}</main>
      </div>
    </RolesProvider>
  );
}
