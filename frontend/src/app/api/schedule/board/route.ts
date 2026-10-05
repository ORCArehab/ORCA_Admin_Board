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
}
interface OrgFacility {
  id: string;
  name: string;
  abbreviation: string | null;
  operationalStatus: string;
  address?: { city?: string | null };
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
 * passed on.
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
      orcaApiRequest<{ staff: OrgStaff[] }>("/v1/org/staff", { userToken }),
      orcaApiRequest<{ facilities: OrgFacility[] }>("/v1/org/facilities", { userToken }),
    ]);

    // The roster omits separated staff and archived facilities; entries may still refer to them.
    const staffById = new Map<string, OrgStaff>();
    for (const s of [...staff.staff, ...schedule.staff]) staffById.set(s.id, s);
    const facilityById = new Map<string, OrgFacility>();
    for (const f of [...facilities.facilities, ...schedule.facilities]) facilityById.set(f.id, f);

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
      })),
      facilities: [...facilityById.values()].map((f) => ({
        id: f.id,
        name: f.name,
        abbreviation: f.abbreviation,
        operationalStatus: f.operationalStatus,
        city: f.address?.city ?? null,
      })),
    });
  } catch (error) {
    return upstreamError(error, "schedule");
  }
}
