import "server-only";

/**
 * Server-side client for the shared ORCA API (ORCA_Careers_API). Every request
 * carries this app's own key (ADMIN_API_KEY there, ORCA_API_KEY here) and,
 * for anything about a person, the user token the API issued at sign-in.
 * The browser never sees either: it only calls this app's /api/* routes.
 */
export class OrcaApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown = null,
  ) {
    super(`ORCA API request failed (${status})`);
    this.name = "OrcaApiError";
  }
}

export function isOrcaApiConfigured(): boolean {
  return !!process.env.ORCA_API_URL?.trim() && !!process.env.ORCA_API_KEY?.trim();
}

export async function orcaApiRequest<T>(
  path: string,
  init: RequestInit & { userToken?: string | null } = {},
): Promise<T> {
  const baseUrl = process.env.ORCA_API_URL?.trim().replace(/\/+$/, "");
  const key = process.env.ORCA_API_KEY?.trim();
  if (!baseUrl || !key) throw new OrcaApiError(503);

  const { userToken, ...rest } = init;
  const res = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: {
      ...rest.headers,
      authorization: `Bearer ${key}`,
      ...(userToken ? { "x-orca-user-token": userToken } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new OrcaApiError(res.status, await res.json().catch(() => null));
  return (await res.json()) as T;
}
