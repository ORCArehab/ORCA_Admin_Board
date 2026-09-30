"use client";

import { fetchProviderDashboard } from "./api";
import type { ProviderDashboard } from "./types";
import { useDashboardResource } from "./useDashboardResource";

export function useProviderDashboard() {
  return useDashboardResource<ProviderDashboard>("providers", fetchProviderDashboard);
}
