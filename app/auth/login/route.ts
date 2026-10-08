import { NextResponse, type NextRequest } from "next/server";
import { webConfig } from "@/lib/config";
import { newPkce } from "@/lib/pkce";
import { OAUTH } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Starts the Authorization Code + PKCE flow against the Cognito Hosted UI. */
export function GET(req: NextRequest) {
  const cfg = webConfig();
  if (cfg.authMode === "local") return NextResponse.redirect(new URL("/auth/dev", cfg.appUrl));

  const { verifier, challenge, state } = newPkce();
  const url = new URL(`${cfg.cognitoDomain}/oauth2/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: `${cfg.appUrl}/auth/callback`,
    scope: "openid email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

  const res = NextResponse.redirect(url);
  // short-lived, httpOnly: holds the PKCE verifier + state until the callback
  res.cookies.set(OAUTH, JSON.stringify({ verifier, state, next: safeNext(req.nextUrl.searchParams.get("next")) }), {
    httpOnly: true, secure: cfg.secureCookies, sameSite: "lax", path: "/auth", maxAge: 600,
  });
  return res;
}

/** Only same-site relative paths: never an open redirect. */
function safeNext(v: string | null): string {
  return v && /^\/(?!\/)[\w\-./?=&%]*$/.test(v) ? v : "/app";
}
