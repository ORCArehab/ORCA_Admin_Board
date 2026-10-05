import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, signedOut, upstreamError, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";
import { isIsoDate } from "@/lib/schedule/week";

interface OrgStaff {
  id: string;
  displayName: string;
  credentials: string | null;
  category: string;
  employmentStatus?: string;
  firstName?: string;
  lastName?: string;
  preferredName?: string | null;
  aliases?: { alias: string }[];
}
interface OrgFacility {
  id: string;
  name: string;
  abbreviation: string | null;
  operationalStatus: string;
  address?: { city?: string | null };
  aliases?: { alias: string }[];
}
interface ScheduleResponse {
  from: string;
  to: string;
  assignments: unknown[];
  staff: OrgStaff[];
  facilities: OrgFacility[];
}

/**
 * One week of the schedule plus the roster and facility list the board needs for its rows and
 * pickers: three ORCA API reads in parallel, one response to the browser. Staff and facilities
 * come from the canonical organization records (/v1/org); only the fields the board uses are
 * passed on. Aliases (former, tracker and preferred names) let quick add find a record by any
 * name it goes by; an API that doesn't send them yet just means name-only search.
 */
export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!isIsoDate(from) || !isIsoDate(to)) return errorResponse(400, "INVALID", "from and to must be dates.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();

  try {
    const query = new URLSearchParams({ from, to });
    const [schedule, staff, facilities] = await Promise.all([
      orcaApiRequest<ScheduleResponse>(`/v1/schedule/assignments?${query}`, { userToken }),
      orcaApiRequest<{ staff: OrgStaff[] }>("/v1/org/staff?include=aliases", { userToken }),
      orcaApiRequest<{ facilities: OrgFacility[] }>("/v1/org/facilities?include=aliases", { userToken }),
    ]);

    // The roster omits separated staff and archived facilities; entries may still refer to them.
    // Roster records win: they carry the names quick add searches by.
    const staffById = new Map<string, OrgStaff>();
    for (const s of [...staff.staff, ...schedule.staff]) if (!staffById.has(s.id)) staffById.set(s.id, s);
    const facilityById = new Map<string, OrgFacility>();
    for (const f of [...facilities.facilities, ...schedule.facilities]) if (!facilityById.has(f.id)) facilityById.set(f.id, f);

    return jsonResponse({
      from: schedule.from,
      to: schedule.to,
      assignments: schedule.assignments,
      staff: [...staffById.values()].map((s) => ({
        id: s.id,
        displayName: s.displayName,
        credentials: s.credentials,
        category: s.category,
        employmentStatus: s.employmentStatus,
        firstName: s.firstName,
        lastName: s.lastName,
        preferredName: s.preferredName ?? null,
        aliases: s.aliases?.map((a) => a.alias),
      })),
      facilities: [...facilityById.values()].map((f) => ({
        id: f.id,
        name: f.name,
        abbreviation: f.abbreviation,
        operationalStatus: f.operationalStatus,
        city: f.address?.city ?? null,
        aliases: f.aliases?.map((a) => a.alias),
      })),
    });
  } catch (error) {
    return upstreamError(error, "schedule");
  }
}
