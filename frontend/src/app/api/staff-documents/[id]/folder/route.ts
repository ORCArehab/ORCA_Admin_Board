import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, passThroughError, signedOut, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sets up (or repairs) the employee's document folder. Safe to repeat: never makes a second folder. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/staff-documents/[id]/folder">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return errorResponse(404, "NOT_FOUND", "Not found.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    return jsonResponse(await orcaApiRequest<unknown>(`/v1/staff-documents/${id}/folder`, { method: "POST", userToken }));
  } catch (error) {
    return passThroughError(error, "documents");
  }
}
