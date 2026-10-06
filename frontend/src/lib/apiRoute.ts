import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { auth } from "@/auth";
import { OrcaApiError } from "@/lib/orcaApi";

/** Errors in the shape the pages read: { error: { code, message } }, plus any details the page needs. */
export function errorResponse(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { code, message }, ...details }, { status, headers: { "cache-control": "no-store" } });
}

export function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

/**
 * The signed-in person's ORCA API user token, or null. auth() also refreshes roles and ends
 * the session if ADMIN was removed. The token lives only in the encrypted session cookie.
 */
export async function userTokenFor(req: NextRequest): Promise<string | null> {
  const session = await auth();
  if (!session?.user) return null;
  // The cookie name depends on whether the site is served over https; try both.
  for (const secureCookie of [true, false]) {
    const token = await getToken({ req, secret: process.env.AUTH_SECRET, secureCookie });
    if (token) return token.orcaApi?.token ?? null;
  }
  return null;
}

/**
 * Maps an ORCA API failure to this app's error shape. Validation errors, conflicts and
 * warnings keep their details so the page can explain them; anything else is generic.
 */
export function upstreamError(error: unknown, context: string) {
  if (error instanceof OrcaApiError) {
    const body = (error.body ?? {}) as { error?: unknown; code?: unknown; errors?: unknown; conflicts?: unknown; warnings?: unknown };
    const message = typeof body.error === "string" ? body.error : null;
    if (error.status === 401) return errorResponse(401, "SIGNED_OUT", "Your session ended. Sign in again.");
    if (error.status === 403) return errorResponse(403, "FORBIDDEN", "This is limited to ORCA admins.");
    if (error.status === 404) return errorResponse(404, "NOT_FOUND", message ?? "Not found.");
    if (error.status === 400) return errorResponse(400, "INVALID", message ?? "Check the entry and try again.", { errors: body.errors ?? [] });
    if (error.status === 409) {
      const code = body.code === "warnings" ? "WARNINGS" : "CONFLICT";
      return errorResponse(409, code, message ?? "This conflicts with an existing record.", { conflicts: body.conflicts ?? [], warnings: body.warnings ?? [], errors: body.errors ?? [] });
    }
    return errorResponse(error.status === 503 ? 503 : 502, "UPSTREAM_ERROR", "The ORCA API couldn't complete this. Try again in a moment.");
  }
  console.error(`[${context}] request failed`, { error: String(error) });
  return errorResponse(502, "UPSTREAM_ERROR", "The ORCA API couldn't be reached. Try again in a moment.");
}

/**
 * Like upstreamError, but keeps the API's own message and code for statuses a page explains
 * itself (documents: not set up, folder missing, Drive unavailable, too large).
 */
export function passThroughError(error: unknown, context: string) {
  if (error instanceof OrcaApiError && [400, 404, 409, 413, 503].includes(error.status)) {
    const body = (error.body ?? {}) as { error?: unknown; code?: unknown };
    const message = typeof body.error === "string" ? body.error : "The request couldn't be completed.";
    const code = typeof body.code === "string" ? body.code.toUpperCase() : error.status === 503 ? "UNAVAILABLE" : "INVALID";
    return errorResponse(error.status, code, message);
  }
  return upstreamError(error, context);
}

export const signedOut = () => errorResponse(401, "SIGNED_OUT", "Sign in to continue.");

/** A JSON object body, or null. */
export async function readJsonObject(req: NextRequest): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}
