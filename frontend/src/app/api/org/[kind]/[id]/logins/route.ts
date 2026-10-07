import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, signedOut, upstreamError, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An employee's credentialing logins (usernames and whether a password is saved; never passwords). HR and ADMIN. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/org/[kind]/[id]/logins">) {
  const { kind, id } = await ctx.params;
  if (kind !== "staff" || !UUID.test(id)) return errorResponse(404, "NOT_FOUND", "Not found.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    return jsonResponse(await orcaApiRequest<unknown>(`/v1/staff-logins/${id}`, { userToken }));
  } catch (error) {
    return upstreamError(error, "logins");
  }
}
