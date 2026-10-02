import type { ScribeDashboard } from "./scribeTypes";
import type { ProviderDashboard } from "./types";

/**
 * The browser only ever calls this app's same-origin /api/dashboard/* routes. Those run on the
 * server and call the shared ORCA API with this app's key and the signed-in admin's user token
 * (src/app/api/dashboard/[resource]/route.ts), so no credentials reach the browser.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

async function getJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
  } catch {
    throw new ApiError(0, "NETWORK", "The dashboard service could not be reached.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(res.status, body?.error?.code ?? "HTTP_ERROR", body?.error?.message ?? `Request failed (${res.status}).`);
  }
  return (await res.json()) as T;
}

export function fetchProviderDashboard(opts: { refresh?: boolean } = {}): Promise<ProviderDashboard> {
  return getJson<ProviderDashboard>(`/api/dashboard/providers${opts.refresh ? "?refresh=true" : ""}`);
}

export function fetchScribeDashboard(opts: { refresh?: boolean } = {}): Promise<ScribeDashboard> {
  return getJson<ScribeDashboard>(`/api/dashboard/scribes${opts.refresh ? "?refresh=true" : ""}`);
}
