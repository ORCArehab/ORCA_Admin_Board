import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, passThroughError, readJsonObject, signedOut, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = ["organization", "username", "password", "loginMethod", "loginMethodDetail", "status", "notes"];

/** Edits one access record. The password goes straight to the ORCA API (encrypted there), never logged or kept here. */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/facility-access/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return errorResponse(404, "NOT_FOUND", "Not found.");
  const body = await readJsonObject(req);
  if (!body) return errorResponse(400, "INVALID", "Invalid request.");
  const changes = Object.fromEntries(Object.entries(body).filter(([k]) => FIELDS.includes(k)));
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    return jsonResponse(
      await orcaApiRequest<unknown>(`/v1/facility-access/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(changes), userToken }),
    );
  } catch (error) {
    return passThroughError(error, "facility-access");
  }
}
