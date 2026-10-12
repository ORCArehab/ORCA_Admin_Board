import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, signedOut, upstreamError, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";
import { isIsoDate } from "@/lib/schedule/week";

/** What providers currently see for a week (when it was last sent) and how many board changes they don't see yet. */
export async function GET(req: NextRequest) {
  const weekStart = req.nextUrl.searchParams.get("weekStart");
  if (!isIsoDate(weekStart)) return errorResponse(400, "INVALID", "Choose a week.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    return jsonResponse(await orcaApiRequest<unknown>(`/v1/schedule/publication?weekStart=${weekStart}`, { userToken }));
  } catch (error) {
    return upstreamError(error, "schedule");
  }
}
