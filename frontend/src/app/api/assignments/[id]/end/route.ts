import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, passThroughError, readJsonObject, signedOut, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ends a facility assignment as of a date; the ORCA API keeps it as history. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/assignments/[id]/end">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return errorResponse(404, "NOT_FOUND", "Not found.");
  const body = await readJsonObject(req);
  if (!body || typeof body.effectiveTo !== "string") return errorResponse(400, "INVALID", "An end date is required.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    return jsonResponse(
      await orcaApiRequest<unknown>(`/v1/org/assignments/${id}/end`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ effectiveTo: body.effectiveTo }), userToken }),
    );
  } catch (error) {
    return passThroughError(error, "assignments");
  }
}
