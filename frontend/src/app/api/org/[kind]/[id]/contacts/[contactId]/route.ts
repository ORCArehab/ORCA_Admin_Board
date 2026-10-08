import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, passThroughError, readJsonObject, signedOut, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";
import { CONTACT_FIELDS } from "@/lib/org/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = RouteContext<"/api/org/[kind]/[id]/contacts/[contactId]">;

async function target(ctx: Ctx) {
  const { kind, id, contactId } = await ctx.params;
  return kind === "facilities" && UUID.test(id) && UUID.test(contactId) ? `/v1/org/facilities/${id}/contacts/${contactId}` : null;
}

/** Edits a facility contact. Fields not sent are unchanged; null clears. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const path = await target(ctx);
  if (!path) return errorResponse(404, "NOT_FOUND", "Not found.");
  const body = await readJsonObject(req);
  if (!body) return errorResponse(400, "INVALID", "Invalid request.");
  const changes = Object.fromEntries(Object.entries(body).filter(([k]) => CONTACT_FIELDS.includes(k)));
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    return jsonResponse(await orcaApiRequest<unknown>(path, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(changes), userToken }));
  } catch (error) {
    return passThroughError(error, "org");
  }
}

/** Removes a facility contact (the ORCA API keeps it for history). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const path = await target(ctx);
  if (!path) return errorResponse(404, "NOT_FOUND", "Not found.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    return jsonResponse(await orcaApiRequest<unknown>(path, { method: "DELETE", userToken }));
  } catch (error) {
    return passThroughError(error, "org");
  }
}
