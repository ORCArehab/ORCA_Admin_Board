"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { fetchBoard } from "./api";
import type { ScheduleBoardData } from "./types";

export type BoardState =
  | { status: "loading" }
  | { status: "error"; error: ApiError }
  /** loading: a newer week (or a reload) is on its way; `data` is still the week in `weekStart`. */
  | { status: "ready"; data: ScheduleBoardData; weekStart: string; loading: boolean };

type Result = { key: string; weekStart: string; data: ScheduleBoardData } | { key: string; error: ApiError };

const toApiError = (err: unknown) => (err instanceof ApiError ? err : new ApiError(0, "UNKNOWN", "Unexpected error."));

/** One week of the board. Switching weeks keeps the last week on screen until the new one arrives. */
export function useScheduleBoard(weekStart: string): BoardState & { reload: () => void } {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const key = `${weekStart}#${version}`;

  useEffect(() => {
    let current = true;
    fetchBoard(weekStart).then(
      (data) => current && setResult({ key, weekStart, data }),
      (err) => current && setResult({ key, error: toApiError(err) }),
    );
    return () => {
      current = false;
    };
  }, [key, weekStart]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  let state: BoardState;
  if (!result) state = { status: "loading" };
  else if ("error" in result) state = result.key === key ? { status: "error", error: result.error } : { status: "loading" };
  else state = { status: "ready", data: result.data, weekStart: result.weekStart, loading: result.key !== key };
  return { ...state, reload };
}
