import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, readJsonObject, signedOut, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";
import { quickbooksError } from "@/lib/quickbooksRoute";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pairs a provider with a QuickBooks Time user, or a facility with a jobcode (null unpairs). */
export async function PUT(req: NextRequest, ctx: RouteContext<"/api/quickbooks-time/links/[kind]/[id]">) {
  const { kind, id } = await ctx.params;
  if ((kind !== "staff" && kind !== "facilities") || !UUID.test(id)) return errorResponse(404, "NOT_FOUND", "Not found.");
  const body = await readJsonObject(req);
  if (!body || !(body.id === null || (typeof body.id === "number" && Number.isInteger(body.id)))) return errorResponse(400, "INVALID", "Choose a match.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    const data = await orcaApiRequest<unknown>(`/v1/quickbooks-time/links/${kind}/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: body.id }),
      userToken,
    });
    return jsonResponse(data);
  } catch (error) {
    return quickbooksError(error);
  }
}
