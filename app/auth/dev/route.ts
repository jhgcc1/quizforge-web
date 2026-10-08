import { NextResponse, type NextRequest } from "next/server";
import { SignJWT } from "jose";
import { webConfig } from "@/lib/config";
import { setSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const page = (msg = "") => `<!doctype html><meta charset="utf-8"><title>Dev login</title>
<body style="font-family:system-ui;max-width:360px;margin:15vh auto;padding:0 16px">
<h1>Dev login</h1><p>Local development only. Production uses Amazon Cognito.</p>${msg}
<form method="post"><label>User<br><input name="user" value="dev-user" required pattern="[A-Za-z0-9_.-]{2,40}" style="width:100%;padding:8px"></label>
<p><button style="padding:8px 16px">Sign in</button></p></form></body>`;

export function GET() {
  const cfg = webConfig();
  if (cfg.authMode !== "local") return new NextResponse("Not found", { status: 404 });
  return new NextResponse(page(), { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function POST(req: NextRequest) {
  const cfg = webConfig();
  if (cfg.authMode !== "local") return new NextResponse("Not found", { status: 404 });
  const user = String((await req.formData()).get("user") ?? "");
  if (!/^[A-Za-z0-9_.-]{2,40}$/.test(user)) return new NextResponse(page("<p>Invalid user</p>"), { status: 400, headers: { "content-type": "text/html" } });
  const token = await new SignJWT({})
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
