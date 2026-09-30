"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchProviderDashboard } from "./api";
import type { ProviderDashboard } from "./types";

/**
 * Loads the provider dashboard. During client-side navigation (overview → provider detail)
 * the last response is shown immediately and revalidated in the background. The backend
 * already caches Google Sheets reads, so revalidation is cheap.
 */
let lastData: ProviderDashboard | undefined;

export type DashboardState =
  | { status: "loading" }
  | { status: "error"; error: ApiError }
  | { status: "ready"; data: ProviderDashboard; refreshing: boolean };

const toApiError = (err: unknown) => (err instanceof ApiError ? err : new ApiError(0, "UNKNOWN", "Unexpected error."));

export function useProviderDashboard(): DashboardState & { refresh: () => void } {
  const [state, setState] = useState<DashboardState>(() =>
    lastData ? { status: "ready", data: lastData, refreshing: false } : { status: "loading" },
  );

  const apply = useCallback((promise: Promise<ProviderDashboard>, isCurrent: () => boolean = () => true) => {
    promise.then(
      (data) => {
        lastData = data;
        if (isCurrent()) setState({ status: "ready", data, refreshing: false });
      },
      (err) => {
        // Keep showing data we already have if a background revalidation fails.
        if (isCurrent()) setState((s) => (s.status === "ready" ? { ...s, refreshing: false } : { status: "error", error: toApiError(err) }));
      },
    );
  }, []);

  useEffect(() => {
    let current = true;
    apply(fetchProviderDashboard(), () => current);
    return () => {
      current = false;
    };
  }, [apply]);

  /** Re-read the tracker, bypassing the backend cache. */
  const refresh = useCallback(() => {
    setState((s) => (s.status === "ready" ? { ...s, refreshing: true } : { status: "loading" }));
    apply(fetchProviderDashboard({ refresh: true }));
  }, [apply]);

  return { ...state, refresh };
}
