import { NextResponse, type NextRequest } from "next/server";
import { csrfOk } from "@/lib/bff";
import { webConfig } from "@/lib/config";
import { createLimiter, sanitizeReport } from "@/lib/client-log";

export const dynamic = "force-dynamic";

const MAX_BODY = 4096;
const allow = createLimiter(20, 60_000);

/** Browser errors: no login needed (the error may be on the login page), but same-origin only, small and rate limited. */
export async function POST(req: NextRequest) {
  if (!csrfOk(req, webConfig())) return new NextResponse(null, { status: 403 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allow(ip)) return new NextResponse(null, { status: 429, headers: { "retry-after": "60" } });
  const text = await req.text();
  if (text.length > MAX_BODY) return new NextResponse(null, { status: 413 });
  let json: unknown;
  try { json = JSON.parse(text); } catch { return new NextResponse(null, { status: 400 }); }
  const report = sanitizeReport(json);
  if (!report) return new NextResponse(null, { status: 422 });
  console.log(JSON.stringify({ level: "error", msg: "client_error", service: "web", requestId: req.headers.get("x-request-id") ?? undefined, ...report }));
  return new NextResponse(null, { status: 204 });
}
