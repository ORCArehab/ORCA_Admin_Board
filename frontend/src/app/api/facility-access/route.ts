import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, passThroughError, readJsonObject, signedOut, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";

const FIELDS = ["staffId", "facilityId", "system", "systemName", "organization", "username", "password", "loginMethod", "loginMethodDetail", "status", "notes"];

/** Records a provider's hospital login at a facility (PointClickCare or another system). The ORCA API checks facility_access.write (ADMIN, HIM). */
export async function POST(req: NextRequest) {
  const body = await readJsonObject(req);
  if (!body) return errorResponse(400, "INVALID", "Invalid request.");
  const input = Object.fromEntries(Object.entries(body).filter(([k]) => FIELDS.includes(k)));
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    const data = await orcaApiRequest<unknown>("/v1/facility-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), userToken });
    return jsonResponse(data, 201);
  } catch (error) {
    return passThroughError(error, "facility-access");
  }
}
