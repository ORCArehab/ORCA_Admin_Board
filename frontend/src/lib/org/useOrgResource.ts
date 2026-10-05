"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";

export type OrgResource<T> = { status: "loading" } | { status: "error"; error: ApiError } | { status: "ready"; data: T };

const toApiError = (err: unknown) => (err instanceof ApiError ? err : new ApiError(0, "UNKNOWN", "Unexpected error."));

/** Loads an organization record or list. Always fresh: these pages are where it gets edited. */
export function useOrgResource<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
): OrgResource<T> & { reload: () => void; replace: (update: (data: T) => T) => void } {
  const [state, setState] = useState<OrgResource<T>>({ status: "loading" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    load().then(
      (data) => current && setState({ status: "ready", data }),
      (err) => current && setState({ status: "error", error: toApiError(err) }),
    );
    return () => {
      current = false;
    };
    // load is recreated each render; deps says when it actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  /** Shows a saved record immediately (from the save response) while a reload confirms it. */
  const replace = useCallback((update: (data: T) => T) => setState((s) => (s.status === "ready" ? { status: "ready", data: update(s.data) } : s)), []);
  return { ...state, reload, replace };
}
