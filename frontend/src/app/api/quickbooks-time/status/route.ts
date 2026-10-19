import type { NextRequest } from "next/server";
import { jsonResponse, signedOut, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";
import { quickbooksError } from "@/lib/quickbooksRoute";

/** Whether QuickBooks Time is connected, where the schedule is kept (ORCA or QuickBooks Time) and when it was last pulled. Admins only (the ORCA API checks). */
export async function GET(req: NextRequest) {
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    return jsonResponse(await orcaApiRequest<unknown>("/v1/quickbooks-time/status", { userToken }));
  } catch (error) {
    return quickbooksError(error);
  }
}
