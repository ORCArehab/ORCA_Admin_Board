import "server-only";
import NextAuth from "next-auth";
import Google, { type GoogleProfile } from "next-auth/providers/google";
import { refreshWithApi, signInWithApi, type SignInOutcome } from "@/lib/session";

/** ORCA's Google Workspace domain. Unset = nobody can sign in (fail closed). */
const allowedDomain = process.env.ALLOWED_GOOGLE_DOMAIN?.trim().toLowerCase() || null;

/** How often a session re-checks the person's roles with the API (which itself checks on every request). */
const ROLE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

const SIGN_IN_ERRORS: Record<Extract<SignInOutcome, { ok: false }>["reason"], string> = {
  "not-admin": "NotAdmin",
  disabled: "AccountDisabled",
  conflict: "AccountConflict",
  unavailable: "SignInUnavailable",
};

/**
 * Hands the API's sign-in result from the signIn callback to the jwt callback.
 * Auth.js passes the same `account` object to both within one request.
 */
const pendingSignIns = new WeakMap<object, Extract<SignInOutcome, { ok: true }>>();

function isOrcaWorkspaceAccount(profile: GoogleProfile | undefined) {
  if (!allowedDomain || !profile?.email || profile.email_verified !== true) return false;
  return profile.email.split("@")[1]?.toLowerCase() === allowedDomain && profile.hd?.toLowerCase() === allowedDomain;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // AUTH_URL pins the origin in production; this only matters for previews and local dev.
  trustHost: true,
  providers: [
    Google({
      // The same OAuth client as the employee portal (the API accepts it for this app too).
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          // Identity only.
          scope: "openid email profile",
          // Pre-filters Google's account chooser; the signIn callback is the real check.
          ...(allowedDomain ? { hd: allowedDomain } : {}),
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
    // Re-authenticate roughly once per workday.
    maxAge: 8 * 60 * 60,
    updateAge: 60 * 60,
  },
  pages: { signIn: "/sign-in", error: "/access-denied" },
  callbacks: {
    async signIn({ profile, account }) {
      const googleProfile = profile as GoogleProfile | undefined;
      if (!isOrcaWorkspaceAccount(googleProfile) || !account) {
        console.warn("[auth] rejected sign-in: not an ORCA Workspace account");
        return false;
      }
      const outcome = await signInWithApi(account.id_token, googleProfile?.picture ?? null);
      if (!outcome.ok) {
        console.warn("[auth] rejected sign-in", { reason: outcome.reason });
        return `/access-denied?error=${SIGN_IN_ERRORS[outcome.reason]}`;
      }
      pendingSignIns.set(account, outcome);
      return true;
    },
    async jwt({ token, account, trigger }) {
      if (trigger === "signIn" || trigger === "signUp") {
        const outcome = account ? pendingSignIns.get(account) : undefined;
        if (!outcome) throw new Error("Sign-in result missing");
        token.adminUser = outcome.user;
        token.orcaApi = outcome.apiSession;
        return token;
      }

      // Pick up role changes; end the session if the person was deactivated or lost Admin/HR.
      if (token.adminUser && token.orcaApi && Date.now() - token.orcaApi.refreshedAt > ROLE_REFRESH_INTERVAL_MS) {
        const result = await refreshWithApi(token.orcaApi, token.adminUser);
        if (result === "signed-out") return null;
        if (result !== "unavailable") {
          token.adminUser = result.user;
          token.orcaApi = result.apiSession;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.adminUser) {
        session.user = { ...session.user, ...token.adminUser };
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      console.log("[auth] sign-in", { email: user.email, at: new Date().toISOString() });
    },
  },
});
