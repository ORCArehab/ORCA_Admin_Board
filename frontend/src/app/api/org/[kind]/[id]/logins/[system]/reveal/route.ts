import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, passThroughError, signedOut, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYSTEMS = ["caqh", "nppes", "pecos"];

/**
 * Reveals a saved password. The ORCA API records the reveal in the employee's activity before
 * answering; this route only relays it (no-store, never logged).
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/org/[kind]/[id]/logins/[system]/reveal">) {
  const { kind, id, system } = await ctx.params;
  if (kind !== "staff" || !UUID.test(id) || !SYSTEMS.includes(system)) return errorResponse(404, "NOT_FOUND", "Not found.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    return jsonResponse(await orcaApiRequest<unknown>(`/v1/staff-logins/${id}/${system}/reveal`, { method: "POST", userToken }));
  } catch (error) {
    return passThroughError(error, "logins");
  }
}
