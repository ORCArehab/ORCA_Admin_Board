import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canSee, homeFor, sectionForPath } from "@/lib/access";

const PUBLIC_PATHS = ["/sign-in", "/access-denied"];

/**
 * Sends signed-out visitors to /sign-in, and people to a page their roles open (HR lands on
 * Employees), before any page renders. A cheap, cookie-only check; the API routes and the
 * ORCA API itself check the session and the roles again on every data request.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return NextResponse.next();

  if (!req.auth) {
    const signInUrl = new URL("/sign-in", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }
  const roles = req.auth.user?.roles ?? [];
  const section = sectionForPath(pathname);
  if (section && !canSee(roles, section)) return NextResponse.redirect(new URL(homeFor(roles), req.nextUrl.origin));
  return NextResponse.next();
});

export const config = {
  // Pages only: /api/* routes answer 401 themselves rather than redirecting.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
