import { ApiError } from "@/lib/api";
import type { Assignment, AssignmentInput, Issue, ScheduleBoardData } from "./types";
import { addDays } from "./week";

/**
 * Browser client for this app's same-origin /api/schedule/* routes. Those run on the server
 * and call the ORCA API with this app's key and the admin's user token.
 */
export class ScheduleError extends ApiError {
  constructor(
    status: number,
    code: string,
    message: string,
    readonly conflicts: Issue[] = [],
    readonly warnings: Issue[] = [],
    readonly errors: string[] = [],
  ) {
    super(status, code, message);
    this.name = "ScheduleError";
  }

  /** Saved only once the admin confirms. */
  get needsConfirmation(): boolean {
    return this.code === "WARNINGS";
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
    throw new ScheduleError(0, "NETWORK", "The schedule service could not be reached.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
      conflicts?: Issue[];
      warnings?: Issue[];
      errors?: string[];
    } | null;
    throw new ScheduleError(
      res.status,
      body?.error?.code ?? "HTTP_ERROR",
      body?.error?.message ?? `Request failed (${res.status}).`,
      body?.conflicts ?? [],
      body?.warnings ?? [],
      body?.errors ?? [],
    );
  }
  return (await res.json()) as T;
}

export function fetchBoard(weekStart: string): Promise<ScheduleBoardData> {
  const query = new URLSearchParams({ from: weekStart, to: addDays(weekStart, 6) });
  return request<ScheduleBoardData>(`/api/schedule/board?${query}`);
}

export interface SaveResult {
  assignment: Assignment;
  warnings: Issue[];
}

export function createAssignment(input: AssignmentInput): Promise<SaveResult> {
  return request<SaveResult>("/api/schedule/assignments", { method: "POST", body: JSON.stringify(input) });
}

export function updateAssignment(id: string, input: AssignmentInput): Promise<SaveResult> {
  return request<SaveResult>(`/api/schedule/assignments/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteAssignment(id: string): Promise<{ deleted: boolean }> {
  return request(`/api/schedule/assignments/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function copyWeek(fromWeekStart: string, toWeekStart: string): Promise<{ copied: number; skipped: { sourceId: string; reason: string }[] }> {
  return request("/api/schedule/copy-week", { method: "POST", body: JSON.stringify({ fromWeekStart, toWeekStart }) });
}
