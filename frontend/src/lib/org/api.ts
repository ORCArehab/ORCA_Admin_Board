import { ApiError } from "@/lib/api";
import type { Facility, FacilityDetail, FieldError, OrgKind, Staff, StaffDetail } from "./types";

/**
 * Browser client for this app's same-origin /api/org/* routes. Those run on the server and
 * call the ORCA API with this app's key and the admin's user token.
 */
export class OrgError extends ApiError {
  constructor(
    status: number,
    code: string,
    message: string,
    readonly fieldErrors: FieldError[] = [],
  ) {
    super(status, code, message);
    this.name = "OrgError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
    });
  } catch {
    throw new OrgError(0, "NETWORK", "The ORCA API could not be reached.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string }; errors?: unknown } | null;
    const fieldErrors = Array.isArray(body?.errors)
      ? body.errors.filter((e): e is FieldError => !!e && typeof e === "object" && typeof e.field === "string" && typeof e.message === "string")
      : [];
    throw new OrgError(res.status, body?.error?.code ?? "HTTP_ERROR", body?.error?.message ?? `Request failed (${res.status}).`, fieldErrors);
  }
  return (await res.json()) as T;
}

const path = (kind: OrgKind, id?: string) => `/api/org/${kind}${id ? `/${encodeURIComponent(id)}` : ""}`;
const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const patch = (body: unknown): RequestInit => ({ method: "PATCH", body: JSON.stringify(body) });

/** Everyone, including former staff; the page filters. */
export const listStaff = () => request<{ staff: Staff[] }>(`${path("staff")}?include_separated=true`).then((r) => r.staff);
export const getStaff = (id: string) => request<StaffDetail>(path("staff", id));
export const createStaff = (input: Record<string, unknown>) => request<{ staff: Staff }>(path("staff"), post(input)).then((r) => r.staff);
export const updateStaff = (id: string, changes: Record<string, unknown>) => request<{ changed: string[]; staff: Staff }>(path("staff", id), patch(changes));

/** Every facility, including archived ones; the page filters. */
export const listFacilities = () => request<{ facilities: Facility[] }>(`${path("facilities")}?include_archived=true`).then((r) => r.facilities);
export const getFacility = (id: string) => request<FacilityDetail>(path("facilities", id));
export const createFacility = (input: Record<string, unknown>) => request<{ facility: Facility }>(path("facilities"), post(input)).then((r) => r.facility);
export const updateFacility = (id: string, changes: Record<string, unknown>) =>
  request<{ changed: string[]; facility: Facility }>(path("facilities", id), patch(changes));
