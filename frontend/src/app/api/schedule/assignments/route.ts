import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, readJsonObject, signedOut, upstreamError, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";

/** Creates a schedule entry. The ORCA API validates it and checks schedule.write (ADMIN). */
export async function POST(req: NextRequest) {
  const body = await readJsonObject(req);
  if (!body) return errorResponse(400, "INVALID", "Invalid request.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    const data = await orcaApiRequest<unknown>("/v1/schedule/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      userToken,
    });
    return jsonResponse(data, 201);
  } catch (error) {
    return upstreamError(error, "schedule");
  }
}
