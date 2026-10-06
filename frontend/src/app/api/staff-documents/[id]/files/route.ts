import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, passThroughError, signedOut, userTokenFor } from "@/lib/apiRoute";
import { MAX_DOCUMENT_BYTES } from "@/lib/org/documents";
import { orcaApiRequest } from "@/lib/orcaApi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Adds a document: the file is passed straight to the ORCA API, which puts it in Drive. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/staff-documents/[id]/files">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return errorResponse(404, "NOT_FOUND", "Not found.");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const category = form?.get("category");
  if (!(file instanceof File) || typeof category !== "string") return errorResponse(400, "INVALID", "Choose a file and where it goes.");
  if (file.size > MAX_DOCUMENT_BYTES) return errorResponse(413, "TOO_LARGE", "Files must be 4 MB or smaller.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  const body = new FormData();
  body.set("category", category);
  body.set("file", file, file.name);
  try {
    return jsonResponse(await orcaApiRequest<unknown>(`/v1/staff-documents/${id}/files`, { method: "POST", body, userToken }), 201);
  } catch (error) {
    return passThroughError(error, "documents");
  }
}
