/**
 * Who can see what in ORCA Admin, decided by the signed-in person's roles. The ORCA API checks
 * every request again (its own permissions table); this only decides what the app shows and
 * which pages it opens, so nobody lands on a page that would just say "not allowed".
 *
 *   Admin  everything except employee Contracts (unless they also have HR); manages Category and People
 *   HR     Employees, including Contracts
 *   HIM    Facilities, including provider access to facility systems (PCC)
 */

/** The roles an employee's Category is made of (the roles on their sign-in account). */
export const ROLE_OPTIONS = [
  { key: "PROVIDER", label: "Provider", description: "Clinical providers. Sees their own schedule in the portal." },
  { key: "SCRIBE", label: "Scribe", description: "Medical scribes." },
  { key: "ADMIN", label: "Admin", description: "Runs ORCA Admin: operations, schedule, facilities, people and roles." },
  { key: "HR", label: "HR", description: "Employee records, applicants, and employee contracts." },
  { key: "HIM", label: "HIM", description: "Facility records, provider-facility assignments and facility system access (PCC)." },
  { key: "IT", label: "IT", description: "IT support staff." },
] as const;
export type RoleKey = (typeof ROLE_OPTIONS)[number]["key"];
export const roleLabel = (key: string) => ROLE_OPTIONS.find((r) => r.key === key)?.label ?? key;

/** People with any of these roles may sign in to ORCA Admin. */
export const APP_ROLES = ["ADMIN", "HR", "HIM"];

export type Section = "overview" | "providers" | "scribes" | "schedule" | "employees" | "facilities" | "people";

const SECTION_ROLES: Record<Section, string[]> = {
  overview: ["ADMIN"],
  providers: ["ADMIN"],
  scribes: ["ADMIN"],
  schedule: ["ADMIN"],
  employees: ["ADMIN", "HR"],
  facilities: ["ADMIN", "HIM"],
  people: ["ADMIN"],
};

const has = (roles: readonly string[], allowed: readonly string[]) => roles.some((r) => allowed.includes(r));

export const canUseApp = (roles: readonly string[]) => has(roles, APP_ROLES);
export const canSee = (roles: readonly string[], section: Section) => has(roles, SECTION_ROLES[section]);
/** Provider access to facility systems (PCC): view, edit, reveal. Mirrors the API's facility_access.*. */
export const canManageFacilityAccess = (roles: readonly string[]) => has(roles, ["ADMIN", "HIM"]);
/** Setting an employee's Category hands out access, so admins only. */
export const canManageAccess = (roles: readonly string[]) => roles.includes("ADMIN");

/** The section a path belongs to, for the page guard. Null for pages anyone signed in may see. */
export function sectionForPath(path: string): Section | null {
  if (path === "/") return "overview";
  const first = path.split("/")[1] ?? "";
  return (["providers", "scribes", "schedule", "employees", "facilities", "people"] as const).find((s) => s === first) ?? null;
}

/** Where someone lands: the first section they can see. */
export function homeFor(roles: readonly string[]): string {
  if (canSee(roles, "overview")) return "/";
  if (canSee(roles, "employees")) return "/employees";
  if (canSee(roles, "facilities")) return "/facilities";
  return "/access-denied";
}
