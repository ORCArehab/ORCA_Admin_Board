import { OrgError } from "@/lib/org/api";

/** Sign-in accounts and their roles, through this app's /api/admin/people routes (admins only). */
export interface Person {
  id: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  active: boolean;
  roles: string[];
  lastSignInAt: string | null;
  createdAt: string;
  /** The employee record this account is linked to, if any. */
  staff: { id: string; displayName: string } | null;
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store", headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) } });
  } catch {
    throw new OrgError(0, "NETWORK", "ORCA Admin couldn't be reached.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new OrgError(res.status, body?.error?.code ?? "HTTP_ERROR", body?.error?.message ?? `Request failed (${res.status}).`);
  }
  return (await res.json()) as T;
}

const base = "/api/admin/people";
export const listPeople = (q?: string) => request<{ people: Person[] }>(`${base}${q ? `?q=${encodeURIComponent(q)}` : ""}`).then((r) => r.people);
export const addPerson = (email: string, name?: string) => request<{ person: Person }>(base, { method: "POST", body: JSON.stringify({ email, name }) });
export const setPersonActive = (id: string, active: boolean) => request<{ changed: boolean }>(`${base}/${id}`, { method: "PATCH", body: JSON.stringify({ active }) });

/** Makes the account's roles exactly `roles`, all or nothing (the API refuses removing the last admin). */
export const setPersonRoles = (person: Pick<Person, "id">, roles: string[]) =>
  request<{ changed: boolean }>(`${base}/${person.id}/roles`, { method: "PUT", body: JSON.stringify({ roles }) });
