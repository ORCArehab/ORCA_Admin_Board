import "server-only";
import { OrcaApiError, orcaApiRequest } from "@/lib/orcaApi";

/** The signed-in admin, as shown in the app. */
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  image: string | null;
  roles: string[];
}

/** The ORCA API's user token for this session. Kept only in the encrypted session cookie. */
export interface ApiSession {
  token: string;
  expiresAt: string;
  /** When the token and roles were last fetched (ms since epoch). */
  refreshedAt: number;
}

interface ApiSessionResponse {
  person: { id: string; email: string; name: string | null; imageUrl: string | null; active: boolean; roles: string[] };
  token: string;
  expiresAt: string;
}

export type SignInOutcome =
  | { ok: true; user: AdminUser; apiSession: ApiSession }
  | { ok: false; reason: "not-admin" | "disabled" | "conflict" | "unavailable" };

/** Only ADMINs may use this app. The API checks again on every request. */
const isAdmin = (roles: string[]) => roles.includes("ADMIN");

function toResult(response: ApiSessionResponse, fallbackImage: string | null) {
  const { person } = response;
  return {
    user: {
      id: person.id,
      email: person.email,
      name: person.name ?? person.email,
      image: person.imageUrl ?? fallbackImage,
      roles: person.roles,
    },
    apiSession: { token: response.token, expiresAt: response.expiresAt, refreshedAt: Date.now() },
  };
}

/** Exchanges this sign-in's Google ID token (which the API verifies itself) for the person's roles and a user token. */
export async function signInWithApi(idToken: string | undefined, image: string | null): Promise<SignInOutcome> {
  if (!idToken) return { ok: false, reason: "unavailable" };
  try {
    const response = await orcaApiRequest<ApiSessionResponse>("/v1/identity/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!isAdmin(response.person.roles)) return { ok: false, reason: "not-admin" };
    return { ok: true, ...toResult(response, image) };
  } catch (error) {
    if (error instanceof OrcaApiError && error.status === 403) return { ok: false, reason: "disabled" };
    if (error instanceof OrcaApiError && error.status === 409) return { ok: false, reason: "conflict" };
    console.error("[auth] ORCA API sign-in failed", { error: String(error) });
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * A fresh token and current roles. "signed-out" when the person was
 * deactivated, lost ADMIN, or signed in too long ago.
 */
export async function refreshWithApi(
  session: ApiSession,
  current: AdminUser,
): Promise<{ user: AdminUser; apiSession: ApiSession } | "signed-out" | "unavailable"> {
  try {
    const response = await orcaApiRequest<ApiSessionResponse>("/v1/identity/sessions/refresh", {
      method: "POST",
      userToken: session.token,
    });
    if (!isAdmin(response.person.roles)) return "signed-out";
    return toResult(response, current.image);
  } catch (error) {
    if (error instanceof OrcaApiError && error.status === 401) return "signed-out";
    console.error("[auth] ORCA API session refresh failed", { error: String(error) });
    return "unavailable";
  }
}
