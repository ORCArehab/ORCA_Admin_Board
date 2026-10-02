import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { auth } from "@/auth";
import { OrcaApiError, orcaApiRequest } from "@/lib/orcaApi";

const RESOURCES = new Set(["providers", "scribes"]);

/** Errors in the shape the dashboard pages read: { error: { code, message } }. */
function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "cache-control": "no-store" } });
}

/**
 * The dashboard's data, fetched from the ORCA API on the server with this
 * app's key and the signed-in person's user token. The API re-checks ADMIN
 * (dashboard.read) on every request.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/dashboard/[resource]">) {
  const { resource } = await ctx.params;
  if (!RESOURCES.has(resource)) return errorResponse(404, "NOT_FOUND", "Not found.");

  // auth() also refreshes roles and ends the session if ADMIN was removed.
  const session = await auth();
  if (!session?.user) return errorResponse(401, "SIGNED_OUT", "Sign in to view the dashboard.");

  let userToken: string | undefined;
  // The cookie name depends on whether the site is served over https; try both.
  for (const secureCookie of [true, false]) {
    const token = await getToken({ req, secret: process.env.AUTH_SECRET, secureCookie });
    if (token) {
      userToken = token.orcaApi?.token;
      break;
    }
  }
  if (!userToken) return errorResponse(401, "SIGNED_OUT", "Sign in to view the dashboard.");

  const refresh = req.nextUrl.searchParams.get("refresh") === "true";
  try {
    const data = await orcaApiRequest<unknown>(`/v1/dashboard/${resource}${refresh ? "?refresh=true" : ""}`, { userToken });
    return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof OrcaApiError) {
      if (error.status === 401) return errorResponse(401, "SIGNED_OUT", "Your session ended. Sign in again.");
      if (error.status === 403) return errorResponse(403, "FORBIDDEN", "This dashboard is limited to ORCA admins.");
      const body = error.body as { error?: unknown; code?: unknown } | null;
      const code = typeof body?.code === "string" ? body.code : "UPSTREAM_ERROR";
      const message = typeof body?.error === "string" ? body.error : "The ORCA API couldn't load this data. Try again in a moment.";
      return errorResponse(error.status === 503 ? 503 : 502, code, message);
    }
    console.error("[dashboard] request failed", { resource, error: String(error) });
    return errorResponse(502, "UPSTREAM_ERROR", "The ORCA API couldn't be reached. Try again in a moment.");
  }
}
