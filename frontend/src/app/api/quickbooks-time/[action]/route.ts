import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, readJsonObject, signedOut, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";
import { quickbooksError } from "@/lib/quickbooksRoute";
import { isIsoDate } from "@/lib/schedule/week";

/**
 * preview: what sending this week to QuickBooks Time would do, and what still needs matching.
 * send: does it (new events arrive as drafts). pull (Update): with QuickBooks Time as the schedule
 * of record, mirrors its schedule onto the board from this week for five weeks, and publishes it.
 * publish: publishes the week's drafts in QuickBooks Time (and so to the portal).
 * The ORCA API allows admins only.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/quickbooks-time/[action]">) {
  const { action } = await ctx.params;
  if (action !== "preview" && action !== "send" && action !== "pull" && action !== "publish") return errorResponse(404, "NOT_FOUND", "Not found.");
  const body = await readJsonObject(req);
  if (!body || !isIsoDate(body.weekStart)) return errorResponse(400, "INVALID", "Choose a week.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    const data = await orcaApiRequest<unknown>(`/v1/quickbooks-time/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weekStart: body.weekStart }),
      userToken,
    });
    return jsonResponse(data);
  } catch (error) {
    return quickbooksError(error);
  }
}
