import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, passThroughError, readJsonObject, signedOut, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYSTEMS = ["caqh", "nppes", "pecos"];

/**
 * Sets one system's username and/or password. Only username and password are forwarded; the
 * password goes straight to the ORCA API (which encrypts it) and is never logged or stored here.
 */
export async function PUT(req: NextRequest, ctx: RouteContext<"/api/org/[kind]/[id]/logins/[system]">) {
  const { kind, id, system } = await ctx.params;
  if (kind !== "staff" || !UUID.test(id) || !SYSTEMS.includes(system)) return errorResponse(404, "NOT_FOUND", "Not found.");
  const body = await readJsonObject(req);
  if (!body) return errorResponse(400, "INVALID", "Invalid request.");
  const change: Record<string, unknown> = {};
  if ("username" in body) change.username = body.username;
  if ("password" in body) change.password = body.password;
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    const data = await orcaApiRequest<unknown>(`/v1/staff-logins/${id}/${system}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(change),
      userToken,
    });
    return jsonResponse(data);
  } catch (error) {
    // Keeps the API's field errors and "vault not configured" explanation.
    return passThroughError(error, "logins");
  }
}
