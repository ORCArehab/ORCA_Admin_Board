import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, passThroughError, readJsonObject, signedOut, upstreamError, userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";

/** Everyone who can sign in to ORCA apps, with their roles and linked employee record. Admins only (the API checks). */
export async function GET(req: NextRequest) {
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 100);
  try {
    return jsonResponse(await orcaApiRequest<unknown>(`/v1/admin/people${q ? `?q=${encodeURIComponent(q)}` : ""}`, { userToken }));
  } catch (error) {
    return upstreamError(error, "people");
  }
}

/** Adds someone before their first sign-in, so their roles are ready when they arrive. */
export async function POST(req: NextRequest) {
  const body = await readJsonObject(req);
  if (!body || typeof body.email !== "string") return errorResponse(400, "INVALID", "Enter an email.");
  const userToken = await userTokenFor(req);
  if (!userToken) return signedOut();
  try {
    const data = await orcaApiRequest<unknown>("/v1/admin/people", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: body.email, name: typeof body.name === "string" ? body.name : undefined }),
      userToken,
    });
    return jsonResponse(data, 201);
  } catch (error) {
    return passThroughError(error, "people");
  }
}
