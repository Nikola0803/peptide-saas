import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { BLOCKED_API_PREFIXES, BLOCKED_PAGE_PREFIXES, matchesPrefix } from "@/lib/features";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Switched-off modules (see src/lib/features.ts): API calls get a 403,
  // pages (including their server actions) show the block page.
  if (matchesPrefix(pathname, BLOCKED_API_PREFIXES)) {
    return NextResponse.json({ error: "ACCESS_REVOKED" }, { status: 403 });
  }
  if (matchesPrefix(pathname, BLOCKED_PAGE_PREFIXES)) {
    return NextResponse.rewrite(new URL("/blocked", request.url), { status: 403 });
  }

  const response = NextResponse.next();
  response.headers.set("x-pathname", pathname);
  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
