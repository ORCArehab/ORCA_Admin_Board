import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, signedOut, upstreamError, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A draft import: its summary and every row with where it came from and its review state. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/schedule-imports/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return errorResponse(404, "NOT_FOUND", "Not found.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    return jsonResponse(await orcaApiRequest<unknown>(`/v1/schedule-imports/${id}`, { userToken }));
  } catch (error) {
    return upstreamError(error, "schedule-import");
  }
}
