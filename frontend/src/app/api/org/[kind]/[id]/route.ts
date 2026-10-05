import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, readJsonObject, signedOut, upstreamError, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";
import { isOrgKind } from "@/lib/org/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One staff or facility record, with its aliases, assignments and change history. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/org/[kind]/[id]">) {
  const { kind, id } = await ctx.params;
  if (!isOrgKind(kind) || !UUID.test(id)) return errorResponse(404, "NOT_FOUND", "Not found.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    return jsonResponse(await orcaApiRequest<unknown>(`/v1/org/${kind}/${id}`, { userToken }));
  } catch (error) {
    return upstreamError(error, "org");
  }
}

/** Changes a record; fields not sent keep their values. */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/org/[kind]/[id]">) {
  const { kind, id } = await ctx.params;
  if (!isOrgKind(kind) || !UUID.test(id)) return errorResponse(404, "NOT_FOUND", "Not found.");
  const body = await readJsonObject(req);
  if (!body) return errorResponse(400, "INVALID", "Invalid request.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    const data = await orcaApiRequest<unknown>(`/v1/org/${kind}/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      userToken,
    });
    return jsonResponse(data);
  } catch (error) {
    return upstreamError(error, "org");
  }
}
