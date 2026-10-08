import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { accessToken, csrfOk, setSession, unauthorized } from "@/lib/bff";
import { webConfig } from "@/lib/config";
import { validateBody } from "@/lib/validate";

export const dynamic = "force-dynamic";

const PASS_REQUEST = ["content-type", "idempotency-key", "accept"];
const PASS_RESPONSE = ["content-type", "idempotency-replayed", "retry-after", "x-request-id"];

/**
 * Backend-for-frontend: the browser never sees a token. It calls /bff/v1/... with its httpOnly
 * session cookie, and this handler forwards to the API with `Authorization: Bearer <access token>`.
 */
async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const cfg = webConfig();
  const { path } = await ctx.params;
  if (path[0] !== "v1") return NextResponse.json({ error: { code: "not_found", message: "Not found" } }, { status: 404 });
  if (!csrfOk(req, cfg)) return NextResponse.json({ error: { code: "csrf", message: "Cross-site request blocked" } }, { status: 403 });

  const { token, refreshed } = await accessToken(req, cfg);
  if (!token) return unauthorized();

  const headers = new Headers({ authorization: `Bearer ${token}`, "x-request-id": req.headers.get("x-request-id") ?? randomUUID() });
  for (const h of PASS_REQUEST) if (req.headers.get(h)) headers.set(h, req.headers.get(h)!);

  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();
  const rejected = validateBody(req.method, path, body);
  if (rejected) return NextResponse.json(rejected.body, { status: rejected.status });
  let upstream: Response;
  try {
    upstream = await fetch(`${cfg.apiUrl}/${path.join("/")}${req.nextUrl.search}`, {
      method: req.method,
      headers,
      ...(body !== undefined ? { body } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return NextResponse.json({ error: { code: "upstream_unavailable", message: "The API is unavailable, try again" } }, { status: 502, headers: { "retry-after": "2" } });
  }

  const out = new NextResponse(upstream.status === 204 ? null : await upstream.text(), { status: upstream.status });
  for (const h of PASS_RESPONSE) if (upstream.headers.get(h)) out.headers.set(h, upstream.headers.get(h)!);
  if (refreshed) setSession(out, cfg, refreshed);
  return out;
}

export { handle as GET, handle as POST, handle as PUT };
