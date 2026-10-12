import type { NextRequest } from "next/server";
import { jsonResponse, signedOut, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";
import { quickbooksError } from "@/lib/quickbooksRoute";

/** Disconnects QuickBooks Time: the ORCA API forgets its tokens. Events already sent stay there. */
export async function POST(req: NextRequest) {
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    return jsonResponse(await orcaApiRequest<unknown>("/v1/quickbooks-time/disconnect", { method: "POST", userToken }));
  } catch (error) {
    return quickbooksError(error);
  }
}
