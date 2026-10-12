import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Access denied" };

const MESSAGES: Record<string, string> = {
  NotAdmin: "ORCA Admin is for people with the Admin, HR or HIM role. If an administrator has just given you one, sign in again and you'll get in. Otherwise ask an administrator for access.",
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
          <Link className="button button-primary-sm" href="/sign-in">
            Sign in again
          </Link>
        </p>
      </div>
    </div>
  );
}
