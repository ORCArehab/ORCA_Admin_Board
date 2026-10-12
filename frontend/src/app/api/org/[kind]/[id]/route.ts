import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, readJsonObject, signedOut, upstreamError, userTokenFor } from "@/lib/apiRoute";
import { OrcaApiError, orcaApiRequest } from "@/lib/orcaApi";
import { attachedSummary } from "@/lib/org/deleteFacility";
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

/**
 * Permanently deletes a facility nothing depends on (the ORCA API allows admins only). When it
 * has assignments, schedule entries or hospital logins, the API refuses; the answer says what's
 * attached so the page can suggest archiving instead.
 */
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/org/[kind]/[id]">) {
  const { kind, id } = await ctx.params;
  if (kind !== "facilities" || !UUID.test(id)) return errorResponse(404, "NOT_FOUND", "Not found.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    return jsonResponse(await orcaApiRequest<unknown>(`/v1/org/facilities/${id}`, { method: "DELETE", userToken }));
  } catch (error) {
    if (error instanceof OrcaApiError && error.status === 409) {
      const body = (error.body ?? {}) as { code?: unknown; attached?: unknown };
      if (body.code === "in_use") return errorResponse(409, "IN_USE", `This facility can't be deleted because it has ${attachedSummary(body.attached)}. Archive it instead: it's hidden everywhere and its history is kept.`);
    }
    return upstreamError(error, "org");
  }
}
