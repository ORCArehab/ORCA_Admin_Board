import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, passThroughError, readJsonObject, signedOut, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";
import { CONTACT_FIELDS } from "@/lib/org/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Adds a facility contact (DON, DOR, IT / EHR, ...). The ORCA API checks org.facilities.write (HIM, ADMIN). */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/org/[kind]/[id]/contacts">) {
  const { kind, id } = await ctx.params;
  if (kind !== "facilities" || !UUID.test(id)) return errorResponse(404, "NOT_FOUND", "Not found.");
  const body = await readJsonObject(req);
  if (!body) return errorResponse(400, "INVALID", "Invalid request.");
  const input = Object.fromEntries(Object.entries(body).filter(([k]) => CONTACT_FIELDS.includes(k)));
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    const data = await orcaApiRequest<unknown>(`/v1/org/facilities/${id}/contacts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), userToken });
    return jsonResponse(data, 201);
  } catch (error) {
    return passThroughError(error, "org");
  }
}
