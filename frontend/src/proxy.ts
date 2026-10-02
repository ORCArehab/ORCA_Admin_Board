import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PUBLIC_PATHS = ["/sign-in", "/access-denied"];

/**
 * Sends signed-out visitors to /sign-in before any page renders. A cheap,
 * cookie-only check; the dashboard API route and the ORCA API itself check
 * the session and the ADMIN role again on every data request.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return NextResponse.next();

  if (!req.auth) {
    const signInUrl = new URL("/sign-in", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
});

export const config = {
  // Pages only: /api/* routes answer 401 themselves rather than redirecting.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
