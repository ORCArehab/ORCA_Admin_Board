import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, passThroughError, readJsonObject, signedOut, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";

const FIELDS = ["staffId", "facilityId", "type", "effectiveFrom"];

/** Assigns an employee to a facility. The ORCA API checks the permission for the assignment type. */
export async function POST(req: NextRequest) {
  const body = await readJsonObject(req);
  if (!body) return errorResponse(400, "INVALID", "Invalid request.");
  const input = Object.fromEntries(Object.entries(body).filter(([k]) => FIELDS.includes(k)));
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    const data = await orcaApiRequest<unknown>("/v1/org/assignments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), userToken });
    return jsonResponse(data, 201);
  } catch (error) {
    return passThroughError(error, "assignments");
  }
}
