import type { ScribeDashboard } from "./scribeTypes";
import type { ProviderDashboard } from "./types";

/**
 * The browser only ever calls same-origin /api/* paths:
 *  - local dev: next.config.ts proxies /api/* to the Fastify backend
 *  - production: the HTTPS load balancer routes /api/* to the backend service, and Cloud IAP
 *    authenticates the ORCA Google Workspace user for both services
 * The frontend never holds Google or service credentials.
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
