/** "3 provider assignments, 12 schedule entries and 1 hospital login": what stops a facility being deleted. */
export function attachedSummary(attached: unknown): string {
  const a = (attached && typeof attached === "object" ? attached : {}) as Record<string, unknown>;
  const count = (key: string) => (typeof a[key] === "number" ? (a[key] as number) : 0);
  const parts = [
    [count("assignments"), "provider assignment"],
    [count("scheduleEntries"), "schedule entry", "schedule entries"],
    [count("hospitalLogins"), "hospital login"],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : (many ?? `${one}s`)}`);
  if (parts.length === 0) return "history attached";
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
