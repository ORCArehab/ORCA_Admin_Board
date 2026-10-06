import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, passThroughError, signedOut, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An employee's documents: the ORCA API lists them from Google Drive (metadata only). The
 * browser never talks to Drive or holds its credentials.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/staff-documents/[id]">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return errorResponse(404, "NOT_FOUND", "Not found.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    return jsonResponse(await orcaApiRequest<unknown>(`/v1/staff-documents/${id}`, { userToken }));
  } catch (error) {
    return passThroughError(error, "documents");
  }
}
