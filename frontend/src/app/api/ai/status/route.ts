import type { NextRequest } from "next/server";
import { jsonResponse, signedOut, upstreamError, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";

/** Whether ORCA AI has a language model connected (or is in demo mode), and which tools it has. */
export async function GET(req: NextRequest) {
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    return jsonResponse(await orcaApiRequest<unknown>("/v1/ai/status", { userToken }));
  } catch (error) {
    return upstreamError(error, "ai");
  }
}
