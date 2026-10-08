import { NextResponse, type NextRequest } from "next/server";
import { webConfig } from "@/lib/config";
import { clearSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// POST only: a GET logout could be triggered cross-site by an image tag.
export function POST(_req: NextRequest) {
  const cfg = webConfig();
  const target =
    cfg.authMode === "local"
      ? new URL("/", cfg.appUrl)
      : new URL(`${cfg.cognitoDomain}/logout?${new URLSearchParams({ client_id: cfg.clientId, logout_uri: cfg.appUrl })}`);
  const res = NextResponse.redirect(target, 303);
  clearSession(res, cfg);
  return res;
}
