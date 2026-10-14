import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, passThroughError, signedOut, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Confirms the import's best-guess matches: all of them, or `labels` only. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/schedule-imports/[id]/confirm-suggestions">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return errorResponse(404, "NOT_FOUND", "Not found.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  const body = (await req.json().catch(() => ({}))) as { labels?: unknown };
  try {
    return jsonResponse(
      await orcaApiRequest<unknown>(`/v1/schedule-imports/${id}/confirm-suggestions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body.labels === undefined ? {} : { labels: body.labels }),
        userToken,
      }),
    );
  } catch (error) {
    return passThroughError(error, "schedule-import");
  }
}
