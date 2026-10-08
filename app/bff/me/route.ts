import { NextResponse, type NextRequest } from "next/server";
import { accessToken, setSession, unauthorized } from "@/lib/bff";
import { webConfig } from "@/lib/config";
import { peek } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cfg = webConfig();
  const { token, refreshed } = await accessToken(req, cfg);
  if (!token) return unauthorized();
  const res = NextResponse.json({ sub: peek(token)?.sub ?? null });
  if (refreshed) setSession(res, cfg, refreshed);
  return res;
}
