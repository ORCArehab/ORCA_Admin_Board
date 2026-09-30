"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";

/**
 * Loads one dashboard resource. During client-side navigation (overview → detail) the last
 * response is shown immediately and revalidated in the background. The backend already
 * caches Google Sheets reads, so revalidation is cheap.
 */
export type ResourceState<T> =
  | { status: "loading" }
  | { status: "error"; error: ApiError }
  | { status: "ready"; data: T; refreshing: boolean };

const lastData = new Map<string, unknown>();
const toApiError = (err: unknown) => (err instanceof ApiError ? err : new ApiError(0, "UNKNOWN", "Unexpected error."));

export function useDashboardResource<T>(key: string, fetcher: (opts: { refresh?: boolean }) => Promise<T>): ResourceState<T> & { refresh: () => void } {
  const [state, setState] = useState<ResourceState<T>>(() => {
    const cached = lastData.get(key) as T | undefined;
    return cached ? { status: "ready", data: cached, refreshing: false } : { status: "loading" };
  });

  const apply = useCallback(
    (promise: Promise<T>, isCurrent: () => boolean = () => true) => {
      promise.then(
        (data) => {
          lastData.set(key, data);
          if (isCurrent()) setState({ status: "ready", data, refreshing: false });
        },
        (err) => {
          // Keep showing data we already have if a background revalidation fails.
          if (isCurrent()) setState((s) => (s.status === "ready" ? { ...s, refreshing: false } : { status: "error", error: toApiError(err) }));
        },
      );
    },
    [key],
  );

  useEffect(() => {
    let current = true;
    apply(fetcher({}), () => current);
    return () => {
      current = false;
    };
    // fetcher is a stable module-level function per resource
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apply]);

  /** Re-read the source spreadsheet, bypassing the backend cache. */
  const refresh = useCallback(() => {
    setState((s) => (s.status === "ready" ? { ...s, refreshing: true } : { status: "loading" }));
    apply(fetcher({ refresh: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apply]);

  return { ...state, refresh };
}
