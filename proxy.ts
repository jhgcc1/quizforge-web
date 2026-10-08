import { NextResponse, type NextRequest } from "next/server";

/** Gate the app pages: no session cookie -> straight to sign-in (the API still verifies every token). */
export function proxy(req: NextRequest) {
  if (req.cookies.get("qf_at") || req.cookies.get("qf_rt")) return NextResponse.next();
  const url = new URL("/auth/login", req.url);
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/app/:path*"] };
