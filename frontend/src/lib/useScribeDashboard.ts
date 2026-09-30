"use client";

import { fetchScribeDashboard } from "./api";
import type { ScribeDashboard } from "./scribeTypes";
import { useDashboardResource } from "./useDashboardResource";

export function useScribeDashboard() {
  return useDashboardResource<ScribeDashboard>("scribes", fetchScribeDashboard);
}
