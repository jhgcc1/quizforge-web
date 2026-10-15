import { NextResponse, type NextRequest } from "next/server";
import { webConfig } from "@/lib/config";
import { buildAuthorizeUrl, parseProvider } from "@/lib/oauth-url";
import { newPkce } from "@/lib/pkce";
import { OAUTH } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Starts the Authorization Code + PKCE flow against the Cognito Hosted UI.
 * ?mode=signup -> create-account page; ?provider=google|facebook -> straight to that provider.
 */
export function GET(req: NextRequest) {
  const cfg = webConfig();
  const q = req.nextUrl.searchParams;
  const mode = q.get("mode") === "signup" && cfg.allowSignup ? "signup" : "login";
  const provider = parseProvider(q.get("provider"));
  const next = safeNext(q.get("next"));

  if (cfg.authMode === "local") {
    // local mode: the dev page stands in for Cognito / Google / Facebook; pass the intent along
    const dev = new URL("/auth/dev", cfg.appUrl);
    if (mode === "signup") dev.searchParams.set("mode", "signup");
    if (provider) dev.searchParams.set("provider", provider);
    return NextResponse.redirect(dev);
  }

  const { verifier, challenge, state } = newPkce();
  const url = buildAuthorizeUrl({
    cognitoDomain: cfg.cognitoDomain,
    clientId: cfg.clientId,
    appUrl: cfg.appUrl,
    state,
    challenge,
    mode,
    scope: cfg.oauthScopes,
    // only providers that are switched on; otherwise a plain login
    provider: provider && cfg.socialProviders.includes(provider) ? provider : null,
  });

  const res = NextResponse.redirect(url);
  // short-lived, httpOnly: holds the PKCE verifier + state until the callback
  res.cookies.set(OAUTH, JSON.stringify({ verifier, state, next }), {
    httpOnly: true, secure: cfg.secureCookies, sameSite: "lax", path: "/auth", maxAge: 600,
  });
  return res;
}

/** Only same-site relative paths: never an open redirect. */
function safeNext(v: string | null): string {
  return v && /^\/(?!\/)[\w\-./?=&%]*$/.test(v) ? v : "/app";
}
