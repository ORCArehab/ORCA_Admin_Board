import type { Metadata } from "next";
import { signIn } from "@/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { callbackUrl } = await searchParams;
  // Same-site paths only, so the sign-in link can't bounce anyone to another site.
  const redirectTo = typeof callbackUrl === "string" && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/";

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>ORCA Admin</h1>
        <p>Rehab operations</p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo });
          }}
        >
          <button type="submit" className="button-primary">
            Continue with Google
          </button>
        </form>
        <p className="fine-print">For ORCA admins. Sign in with your ORCA Rehab Google Workspace account.</p>
      </div>
    </div>
  );
}
