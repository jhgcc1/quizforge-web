import { NextResponse, type NextRequest } from "next/server";
import { accessToken, setSession, unauthorized } from "@/lib/bff";
import { webConfig } from "@/lib/config";
import { loadProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

/** {sub, name?, email?, label}: label = name, else e-mail, else a short id. Tokens never go to the browser. */
export async function GET(req: NextRequest) {
  const cfg = webConfig();
  const { token, refreshed } = await accessToken(req, cfg);
  if (!token) return unauthorized();
  const res = NextResponse.json(await loadProfile(cfg, token));
  if (refreshed) setSession(res, cfg, refreshed);
  return res;
}
