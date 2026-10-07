import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, passThroughError, signedOut, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reveals a saved PCC password; the ORCA API records the reveal on the facility and provider first. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/facility-access/[id]/reveal">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return errorResponse(404, "NOT_FOUND", "Not found.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    return jsonResponse(await orcaApiRequest<unknown>(`/v1/facility-access/${id}/reveal`, { method: "POST", userToken }));
  } catch (error) {
    return passThroughError(error, "facility-access");
  }
}
