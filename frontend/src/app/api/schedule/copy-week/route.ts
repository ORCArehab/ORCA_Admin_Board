import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, readJsonObject, signedOut, upstreamError, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";
import { isIsoDate } from "@/lib/schedule/week";

/** Copies one week into another week's empty provider-days (the API never overwrites). */
export async function POST(req: NextRequest) {
  const body = await readJsonObject(req);
  if (!body || !isIsoDate(body.fromWeekStart) || !isIsoDate(body.toWeekStart)) return errorResponse(400, "INVALID", "Choose two weeks.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    const data = await orcaApiRequest<unknown>("/v1/schedule/copy-week", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromWeekStart: body.fromWeekStart, toWeekStart: body.toWeekStart }),
      userToken,
    });
    return jsonResponse(data);
  } catch (error) {
    return upstreamError(error, "schedule");
  }
}
