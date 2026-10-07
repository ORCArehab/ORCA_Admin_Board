"use client";

import { createContext, useContext, type ReactNode } from "react";

const RolesContext = createContext<readonly string[]>([]);

/** The signed-in person's roles, for deciding what to show. The ORCA API enforces them again. */
export function RolesProvider({ roles, children }: { roles: readonly string[]; children: ReactNode }) {
  return <RolesContext.Provider value={roles}>{children}</RolesContext.Provider>;
}

export const useRoles = () => useContext(RolesContext);
