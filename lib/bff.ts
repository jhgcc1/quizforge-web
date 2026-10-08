import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { WebConfig } from "./config";
import { AT, RT, isFresh, setSession, tokenRequest, type Tokens } from "./session";

/**
 * Resolve a usable access token from the httpOnly cookies, refreshing it with the refresh token
 * when needed. `refreshed` must be written back to the response by the caller.
 */
export async function accessToken(req: NextRequest, cfg: WebConfig): Promise<{ token?: string; refreshed?: Tokens }> {
  const at = req.cookies.get(AT)?.value;
  if (isFresh(at)) return { token: at! };
  const rt = req.cookies.get(RT)?.value;
  if (cfg.authMode === "cognito" && rt) {
    const t = await tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: rt });
    if (t) return { token: t.access_token, refreshed: t };
  }
  return {};
}

/** CSRF defence on top of SameSite=Lax: unsafe methods must come from our own origin with a custom header. */
export function csrfOk(req: NextRequest, cfg: WebConfig): boolean {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const origin = req.headers.get("origin");
  return origin === cfg.appUrl && req.headers.get("x-requested-with") === "quizforge";
}

export const unauthorized = () => NextResponse.json({ error: { code: "unauthenticated", message: "Sign in required" } }, { status: 401 });

export { setSession };
