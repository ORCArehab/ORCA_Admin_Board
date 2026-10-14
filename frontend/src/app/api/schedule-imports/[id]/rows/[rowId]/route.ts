import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, passThroughError, readJsonObject, signedOut, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = ["staffId", "facilityId", "excluded", "accepted", "sameLabel", "time"];

/** A reviewer's decision on a row: a match, its time, exclude, or accept an unclear row as read. */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/schedule-imports/[id]/rows/[rowId]">) {
  const { id, rowId } = await ctx.params;
  if (!UUID.test(id) || !UUID.test(rowId)) return errorResponse(404, "NOT_FOUND", "Not found.");
  const body = await readJsonObject(req);
  if (!body) return errorResponse(400, "INVALID", "Invalid request.");
  const change = Object.fromEntries(Object.entries(body).filter(([k]) => FIELDS.includes(k)));
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    return jsonResponse(await orcaApiRequest<unknown>(`/v1/schedule-imports/${id}/rows/${rowId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(change), userToken }));
  } catch (error) {
    return passThroughError(error, "schedule-import");
  }
}
