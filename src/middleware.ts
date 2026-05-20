import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login"];
const SKIP_PREFIXES = ["/_next", "/favicon", "/XCore", "/hex-favicon", "/api"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Static assets and public routes — skip
  if (SKIP_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Check for auth cookie — real verification happens backend-side
  const token = req.cookies.get("admin_token")?.value;
  if (!token) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
