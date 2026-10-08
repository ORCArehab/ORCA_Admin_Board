import { DEFAULT_CONTACT_ROLES, KEY_CONTACT_ROLES, type FacilityContact } from "./types";

const roleKey = (role: string) => role.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Standard roles first, in their usual order; anything else after, alphabetically. */
export function sortContacts(contacts: FacilityContact[], roles: string[] = DEFAULT_CONTACT_ROLES): FacilityContact[] {
  const rank = (c: FacilityContact) => {
    const i = roles.findIndex((r) => roleKey(r) === roleKey(c.role));
    return i === -1 ? roles.length : i;
  };
  return [...contacts].sort((a, b) => rank(a) - rank(b) || a.role.localeCompare(b.role) || (a.name ?? "").localeCompare(b.name ?? ""));
}

/** The key roles (Administrator, DON, DOR, IT / EHR) nobody is recorded for yet. "IT/EHR" counts as "IT / EHR". */
export function missingKeyRoles(contacts: FacilityContact[]): string[] {
  const have = new Set(contacts.map((c) => roleKey(c.role)));
  return KEY_CONTACT_ROLES.filter((r) => !have.has(roleKey(r)));
}

/** "(555) 010-0400 ext. 204" and a tel: link that dials the extension after a pause. */
export function phoneDisplay(c: Pick<FacilityContact, "phone" | "extension">): { text: string; href: string } | null {
  if (!c.phone) return null;
  const digits = c.phone.replace(/[^\d+]/g, "");
  const ext = c.extension?.replace(/\D/g, "");
  return { text: c.extension ? `${c.phone} ext. ${c.extension}` : c.phone, href: `tel:${digits}${ext ? `,${ext}` : ""}` };
}

/** Google Maps search for an address. */
export const mapsUrl = (lines: string[]) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lines.join(", "))}`;

/** "Orange County", whether the record says "Orange" or "Orange County". */
export const countyLabel = (county: string) => (/\bcounty$/i.test(county.trim()) ? county.trim() : `${county.trim()} County`);
