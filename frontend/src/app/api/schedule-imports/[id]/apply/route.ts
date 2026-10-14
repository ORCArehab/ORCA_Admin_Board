import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, passThroughError, readJsonObject, signedOut, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Adds the approved rows to the schedule, through the schedule's own checks. An admin presses this; ORCA AI can't. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/schedule-imports/[id]/apply">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return errorResponse(404, "NOT_FOUND", "Not found.");
  const body = (await readJsonObject(req)) ?? {};
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    return jsonResponse(await orcaApiRequest<unknown>(`/v1/schedule-imports/${id}/apply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmWarnings: body.confirmWarnings === true }), userToken }));
  } catch (error) {
    return passThroughError(error, "schedule-import");
  }
}
