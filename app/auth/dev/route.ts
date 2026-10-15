import { NextResponse, type NextRequest } from "next/server";
import { SignJWT } from "jose";
import { webConfig } from "@/lib/config";
import { IDENTITY_PROVIDERS, parseProvider } from "@/lib/oauth-url";
import { setSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** What the visitor asked for on the landing page; only allow-listed values are ever echoed. */
function intent(mode: unknown, provider: unknown) {
  const p = parseProvider(typeof provider === "string" ? provider : null);
  return { signup: mode === "signup", provider: p };
}

const page = (msg = "", i: { signup: boolean; provider?: keyof typeof IDENTITY_PROVIDERS } = { signup: false }) => {
  const what = i.provider ? `Continue with ${IDENTITY_PROVIDERS[i.provider]}` : i.signup ? "Create account" : "Sign in";
  const note = i.provider || i.signup
    ? `<p role="note" style="border:1px solid #b45309;padding:8px;border-radius:6px"><strong>SIMULATION</strong>: local development, no real ${i.provider ? IDENTITY_PROVIDERS[i.provider] : "sign-up"}. Any user name works.</p>`
    : "";
  return `<!doctype html><meta charset="utf-8"><title>Dev login</title>
<body style="font-family:system-ui;max-width:360px;margin:15vh auto;padding:0 16px">
<h1>Dev login</h1><p>Local development only. Production uses Amazon Cognito.</p>${note}${msg}
<form method="post"><input type="hidden" name="mode" value="${i.signup ? "signup" : ""}"><input type="hidden" name="provider" value="${i.provider ?? ""}">
<label>User<br><input name="user" value="dev-user" required pattern="[A-Za-z0-9_.-]{2,40}" style="width:100%;padding:8px"></label>
<p><button style="padding:8px 16px">${what}</button></p></form></body>`;
};

export function GET(req: NextRequest) {
  const cfg = webConfig();
  if (cfg.authMode !== "local") return new NextResponse("Not found", { status: 404 });
  const q = req.nextUrl.searchParams;
  return new NextResponse(page("", intent(q.get("mode"), q.get("provider"))), { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function POST(req: NextRequest) {
  const cfg = webConfig();
  if (cfg.authMode !== "local") return new NextResponse("Not found", { status: 404 });
  const form = await req.formData();
  const user = String(form.get("user") ?? "");
  if (!/^[A-Za-z0-9_.-]{2,40}$/.test(user)) {
    return new NextResponse(page("<p>Invalid user</p>", intent(form.get("mode"), form.get("provider"))), { status: 400, headers: { "content-type": "text/html" } });
  }
  const token = await new SignJWT({ name: user, email: `${user}@local.test` })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user)
    .setIssuer("quizforge-local")
    .setAudience("quizforge-api")
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(new TextEncoder().encode(cfg.localSecret));
  const res = NextResponse.redirect(new URL("/app", cfg.appUrl), 303);
  setSession(res, cfg, { access_token: token, expires_in: 8 * 3600 });
  return res;
}
