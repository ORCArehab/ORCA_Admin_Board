import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, readJsonObject, signedOut, upstreamError, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";
import { isOrgKind } from "@/lib/org/types";

/** List filters passed through to the ORCA API; anything else is dropped. */
const LIST_PARAMS = ["q", "status", "category", "type", "region", "include_separated", "include_archived"];

/** Lists staff or facilities. Admins get the full record (employment details, contracts). */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/org/[kind]">) {
  const { kind } = await ctx.params;
  if (!isOrgKind(kind)) return errorResponse(404, "NOT_FOUND", "Not found.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  const query = new URLSearchParams();
  for (const key of LIST_PARAMS) {
    const value = req.nextUrl.searchParams.get(key);
    if (value) query.set(key, value.slice(0, 100));
  }
  try {
    return jsonResponse(await orcaApiRequest<unknown>(`/v1/org/${kind}${query.size ? `?${query}` : ""}`, { userToken }));
  } catch (error) {
    return upstreamError(error, "org");
  }
}

/** Creates a staff or facility record. The ORCA API validates it and checks the write permission. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/org/[kind]">) {
  const { kind } = await ctx.params;
  if (!isOrgKind(kind)) return errorResponse(404, "NOT_FOUND", "Not found.");
  const body = await readJsonObject(req);
  if (!body) return errorResponse(400, "INVALID", "Invalid request.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    const data = await orcaApiRequest<unknown>(`/v1/org/${kind}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      userToken,
    });
    return jsonResponse(data, 201);
  } catch (error) {
    return upstreamError(error, "org");
  }
}
