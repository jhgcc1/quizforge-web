import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { webConfig } from "@/lib/config";
import { OAUTH, setSession, tokenRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

const eq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const fail = (cfg: ReturnType<typeof webConfig>, why: string) => {
  const res = NextResponse.redirect(new URL(`/?error=${encodeURIComponent(why)}`, cfg.appUrl));
  res.cookies.set(OAUTH, "", { path: "/auth", maxAge: 0 });
  return res;
};

export async function GET(req: NextRequest) {
  const cfg = webConfig();
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (req.nextUrl.searchParams.get("error")) return fail(cfg, "login_denied");

  let saved: { verifier: string; state: string; next: string } | undefined;
  try {
    saved = JSON.parse(req.cookies.get(OAUTH)?.value ?? "");
  } catch {
    /* fallthrough */
  }
  if (!code || !state || !saved || !eq(state, saved.state)) return fail(cfg, "invalid_state");

  const tokens = await tokenRequest(cfg, {
    grant_type: "authorization_code",
    code,
    redirect_uri: `${cfg.appUrl}/auth/callback`,
    code_verifier: saved.verifier,
  });
  if (!tokens) return fail(cfg, "token_exchange_failed");

  const res = NextResponse.redirect(new URL(saved.next || "/app", cfg.appUrl));
  setSession(res, cfg, tokens);
  res.cookies.set(OAUTH, "", { path: "/auth", maxAge: 0 });
  return res;
}
