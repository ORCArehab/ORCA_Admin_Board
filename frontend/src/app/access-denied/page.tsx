import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Access denied" };

const MESSAGES: Record<string, string> = {
  NotAdmin: "ORCA Admin is limited to people with the Admin role. Ask an administrator if you need access.",
  AccountDisabled: "Your ORCA account is turned off. Contact an administrator.",
  AccountConflict: "This email is linked to a different Google account. Contact an administrator.",
  SignInUnavailable: "Sign-in isn't available right now. Try again in a moment.",
};
const DEFAULT_MESSAGE = "Sign in with your ORCA Rehab Google Workspace account.";

export default async function AccessDeniedPage({ searchParams }: PageProps<"/access-denied">) {
  const { error } = await searchParams;
  const message = (typeof error === "string" && MESSAGES[error]) || DEFAULT_MESSAGE;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Can&apos;t sign you in</h1>
        <p>{message}</p>
        <p className="fine-print">
          <Link className="text-link" href="/sign-in">
            Try a different account
          </Link>
        </p>
      </div>
    </div>
  );
}
