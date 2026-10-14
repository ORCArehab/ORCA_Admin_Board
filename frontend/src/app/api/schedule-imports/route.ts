import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, passThroughError, signedOut, upstreamError, userTokenFor } from "@/lib/apiRoute";
import { MAX_WORKBOOK_BYTES } from "@/lib/ai/imports";
import { orcaApiRequest } from "@/lib/orcaApi";

/** Uploads a schedule workbook (.xlsx): the ORCA API reads it and returns a draft to review. Nothing is scheduled yet. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return errorResponse(400, "INVALID", "Choose an .xlsx workbook.");
  if (!/\.xlsx$/i.test(file.name)) return errorResponse(400, "WRONG_TYPE", "Only .xlsx workbooks can be imported.");
  if (file.size > MAX_WORKBOOK_BYTES) return errorResponse(413, "TOO_LARGE", "Workbooks must be 4 MB or smaller.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  const body = new FormData();
  body.set("file", file, file.name);
  try {
    return jsonResponse(await orcaApiRequest<unknown>("/v1/schedule-imports", { method: "POST", body, userToken }), 201);
  } catch (error) {
    return passThroughError(error, "schedule-import");
  }
}

export async function GET(req: NextRequest) {
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    return jsonResponse(await orcaApiRequest<unknown>("/v1/schedule-imports", { userToken }));
  } catch (error) {
    return upstreamError(error, "schedule-import");
  }
}
