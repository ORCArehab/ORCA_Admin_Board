import { ApiError } from "@/lib/api";
import type { Facility, FacilityAccess, FacilityDetail, FieldError, OrgKind, Staff, StaffAccess, StaffDetail } from "./types";

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
/** Sets the employee's Access (exactly these roles). `email` links an unlinked record to that ORCA account first. */
export const setStaffAccess = (id: string, roles: string[], email?: string) =>
  request<{ changed: boolean; access: StaffAccess }>(`${path("staff", id)}/access`, { method: "PUT", body: JSON.stringify({ roles, ...(email ? { email } : {}) }) }).then((r) => r.access);

/** Every facility, including archived ones; the page filters. */
export const listFacilities = () => request<{ facilities: Facility[] }>(`${path("facilities")}?include_archived=true`).then((r) => r.facilities);
export const getFacility = (id: string) => request<FacilityDetail>(path("facilities", id));
export const createFacility = (input: Record<string, unknown>) => request<{ facility: Facility }>(path("facilities"), post(input)).then((r) => r.facility);
export const updateFacility = (id: string, changes: Record<string, unknown>) =>
  request<{ changed: string[]; facility: Facility }>(path("facilities", id), patch(changes));

// ── Facility assignments (who covers which facility) ─────────────
// Reads come with the employee and facility. The ORCA API checks the type: rounding provider and
// liaison need HIM or ADMIN; scribe coverage, credentialed and other need HR or ADMIN.

export const createAssignment = (input: { staffId: string; facilityId: string; type: string; effectiveFrom?: string }) =>
  request<unknown>("/api/assignments", post(input));

/** Ends a current assignment; it stays in the history. `effectiveTo` is a yyyy-mm-dd date. */
export const endAssignment = (id: string, effectiveTo: string) => request<unknown>(`/api/assignments/${encodeURIComponent(id)}/end`, post({ effectiveTo }));

// ── Credentialing logins (CAQH, NPPES, PECOS) ─────────────
// Passwords never come back from these calls except revealLoginPassword, which the ORCA API
// records in the employee's activity before answering.

export const LOGIN_SYSTEMS = [
  { key: "caqh", label: "CAQH ProView" },
  { key: "nppes", label: "NPPES" },
  { key: "pecos", label: "PECOS" },
] as const;
export type LoginSystem = (typeof LOGIN_SYSTEMS)[number]["key"];

export interface LoginSummary {
  system: LoginSystem;
  username: string | null;
  hasPassword: boolean;
  passwordSetAt: string | null;
  passwordSetBy: string | null;
  updatedAt: string;
  updatedBy: string;
}

const loginsPath = (staffId: string, system?: LoginSystem) =>
  `/api/org/staff/${encodeURIComponent(staffId)}/logins${system ? `/${system}` : ""}`;

export const getLogins = (staffId: string) => request<{ logins: LoginSummary[]; vaultConfigured: boolean }>(loginsPath(staffId));

/** username/password: omitted = unchanged, null = cleared. */
export const saveLogin = (staffId: string, system: LoginSystem, change: { username?: string | null; password?: string | null }) =>
  request<{ changed: string[]; logins: LoginSummary[] }>(loginsPath(staffId, system), { method: "PUT", body: JSON.stringify(change) });

export const revealLoginPassword = (staffId: string, system: LoginSystem) =>
  request<{ password: string }>(`${loginsPath(staffId, system)}/reveal`, { method: "POST" }).then((r) => r.password);

// ── Provider access to facility systems (PCC) ─────────────
// Reads come with the facility (detail.access) and employee (detail.facilityAccess). Passwords
// never come back except revealFacilityAccessPassword, recorded on the facility and provider.

export type FacilityAccessInput = Partial<{
  organization: string | null;
  username: string | null;
  password: string | null;
  loginMethod: string;
  loginMethodDetail: string | null;
  status: string;
  notes: string | null;
}>;

export const createFacilityAccess = (input: FacilityAccessInput & { staffId: string; facilityId: string; system: "pcc" }) =>
  request<{ access: FacilityAccess }>("/api/facility-access", { method: "POST", body: JSON.stringify(input) }).then((r) => r.access);

export const updateFacilityAccess = (id: string, changes: FacilityAccessInput) =>
  request<{ changed: string[]; access: FacilityAccess }>(`/api/facility-access/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) });

export const revealFacilityAccessPassword = (id: string) =>
  request<{ password: string }>(`/api/facility-access/${encodeURIComponent(id)}/reveal`, { method: "POST" }).then((r) => r.password);
