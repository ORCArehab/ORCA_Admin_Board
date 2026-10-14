import type { NextRequest } from "next/server";
import { errorResponse, readJsonObject, signedOut, userTokenFor } from "@/lib/apiRoute";
import { OrcaApiError, orcaApiStream } from "@/lib/orcaApi";

export const maxDuration = 180;

/**
 * One ORCA AI turn. The conversation goes to the ORCA API, which runs the model and its tools;
 * the answer streams back to the browser as server-sent events, passed through as they arrive.
 * Nothing is stored or logged here.
 */
export async function POST(req: NextRequest) {
  const body = await readJsonObject(req);
  if (!body || !Array.isArray(body.messages)) return errorResponse(400, "INVALID", "Send a question.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    const upstream = await orcaApiStream("/v1/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: body.messages }), userToken });
    return new Response(upstream.body, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" } });
  } catch (error) {
    if (error instanceof OrcaApiError) {
      const message = (error.body as { error?: unknown } | null)?.error;
      if (error.status === 503) return errorResponse(503, "NOT_CONFIGURED", typeof message === "string" ? message : "ORCA AI isn't connected yet.");
      if (error.status === 401) return errorResponse(401, "SIGNED_OUT", "Your session ended. Sign in again.");
      if (error.status === 403) return errorResponse(403, "FORBIDDEN", "ORCA AI is for administrators.");
    }
    console.error("[ai] chat failed", { error: String(error) });
    return errorResponse(502, "UPSTREAM_ERROR", "ORCA AI couldn't be reached. Try again in a moment.");
  }
}
