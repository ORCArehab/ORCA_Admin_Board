import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, passThroughError, readJsonObject, signedOut, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sets an employee's Category (the roles on their sign-in account). The ORCA API allows admins only. */
export async function PUT(req: NextRequest, ctx: RouteContext<"/api/org/[kind]/[id]/access">) {
  const { kind, id } = await ctx.params;
  if (kind !== "staff" || !UUID.test(id)) return errorResponse(404, "NOT_FOUND", "Not found.");
  const body = await readJsonObject(req);
  if (!body || !Array.isArray(body.roles)) return errorResponse(400, "INVALID", "Invalid request.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    const data = await orcaApiRequest<unknown>(`/v1/org/staff/${id}/access`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roles: body.roles, ...(typeof body.email === "string" ? { email: body.email } : {}) }),
      userToken,
    });
    return jsonResponse(data);
  } catch (error) {
    // Keeps the API's own explanations (email needed, account taken, last admin).
    return passThroughError(error, "org");
  }
}
