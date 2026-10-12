import type { NextRequest } from "next/server";
import { jsonResponse, signedOut, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";
import { quickbooksError } from "@/lib/quickbooksRoute";

/** Starts connecting QuickBooks Time: returns the address of its approval page (admins only). */
export async function POST(req: NextRequest) {
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    return jsonResponse(await orcaApiRequest<unknown>("/v1/quickbooks-time/oauth/start", { method: "POST", userToken }));
  } catch (error) {
    return quickbooksError(error);
  }
}
