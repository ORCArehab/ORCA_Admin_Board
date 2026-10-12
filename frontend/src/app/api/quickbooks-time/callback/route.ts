import { NextResponse, type NextRequest } from "next/server";
import { userTokenFor } from "@/lib/apiRoute";
import { orcaApiRequest } from "@/lib/orcaApi";

/**
 * Where QuickBooks Time sends the admin back after they approve (or refuse) access. The code and
 * state go straight to the ORCA API, which checks the state belongs to this admin, exchanges the
 * code and stores the tokens. Then back to the schedule with the outcome; nothing is kept here.
 */
export async function GET(req: NextRequest) {
  const back = (outcome: "connected" | "failed" | "declined") => {
    const url = new URL("/schedule", req.nextUrl.origin);
    url.searchParams.set("quickbooks", outcome);
    return NextResponse.redirect(url, { headers: { "cache-control": "no-store" } });
  };
  const params = req.nextUrl.searchParams;
  if (params.get("error")) return back("declined");
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return back("failed");
  const userToken = await userTokenFor(req);
  if (!userToken) return NextResponse.redirect(new URL("/sign-in", req.nextUrl.origin));
  try {
    await orcaApiRequest<unknown>("/v1/quickbooks-time/oauth/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, state }),
      userToken,
    });
    return back("connected");
  } catch (error) {
    console.error("[quickbooks-time] connect failed", { error: String(error) });
    return back("failed");
  }
}
