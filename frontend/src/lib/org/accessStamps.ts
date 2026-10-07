import { formatDate } from "@/lib/format";
import type { FacilityAccess } from "./types";

/** Which app made a change, as people say it. Unknown (older records) says nothing. */
const VIA: Record<string, string> = { portal: "the provider, in the employee portal", admin: "ORCA Admin", "pcc-import": "the PCC sheet import" };

export interface AccessStamp {
  text: string;
  /** The provider changed it themself in the portal: worth noticing. */
  byProvider: boolean;
}

function stamp(what: string, at: string | null, by: string | null, via: string | null | undefined): AccessStamp | null {
  if (!at) return null;
  const how = via ? VIA[via] ?? via : null;
  const who = via === "portal" ? (by ? `${by} (${how})` : how) : [by, how && `in ${how}`].filter(Boolean).join(" ");
  return { text: `${what} ${formatDate(at)}${who ? ` by ${who}` : ""}`, byProvider: via === "portal" };
}

/** "Username changed Oct 7, 2026 by kim@… (the provider, in the employee portal)", and the same for the password. */
export function accessStamps(a: Pick<FacilityAccess, "username" | "hasPassword" | "usernameSetAt" | "usernameSetBy" | "usernameSetVia" | "passwordSetAt" | "passwordSetBy" | "passwordSetVia">): AccessStamp[] {
  return [
    a.username ? stamp("Username set", a.usernameSetAt ?? null, a.usernameSetBy ?? null, a.usernameSetVia) : null,
    a.hasPassword ? stamp("Password set", a.passwordSetAt, a.passwordSetBy, a.passwordSetVia) : null,
  ].filter((s): s is AccessStamp => s !== null);
}
