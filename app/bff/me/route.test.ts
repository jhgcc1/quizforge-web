import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { GET } = await import("./route.js");
const { clearProfileCache } = await import("@/lib/profile");

const jwt = (claims: Record<string, unknown>, exp = Math.floor(Date.now() / 1000) + 600) =>
  new SignJWT({ ...claims, exp }).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode("k".repeat(32)));
const req = (cookie?: string) => new NextRequest("https://app.example.com/bff/me", cookie ? { headers: { cookie } } : {});

beforeEach(() => {
  clearProfileCache();
  vi.stubEnv("AUTH_MODE", "cognito");
  vi.stubEnv("COGNITO_DOMAIN", "https://auth.example.com");
  vi.stubEnv("APP_URL", "https://app.example.com");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("GET /bff/me", () => {
  it("401 without a usable session", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });
  it("returns sub, name, email and label, and never the token", async () => {
    const t = await jwt({ sub: "s-1" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: "Ana", email: "ana@example.com" }))));
    const res = await GET(req(`qf_at=${t}`));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ sub: "s-1", name: "Ana", email: "ana@example.com", label: "Ana", admin: false });
    expect(text).not.toContain(t);
  });
  it("falls back to the sub when userInfo fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const res = await GET(req(`qf_at=${await jwt({ sub: "s-2" })}`));
    expect(await res.json()).toEqual({ sub: "s-2", label: "s-2", admin: false });
  });
  it("a refreshed session is written back as cookies", async () => {
    const fresh = await jwt({ sub: "s-3" });
    vi.stubEnv("COGNITO_CLIENT_ID", "cid");
    vi.stubEnv("COGNITO_CLIENT_SECRET", "sec");
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.endsWith("/oauth2/token") ? new Response(JSON.stringify({ access_token: fresh, expires_in: 3600 })) : new Response(JSON.stringify({ email: "a@b.co" }))));
    const res = await GET(req(`qf_at=${await jwt({ sub: "s-3" }, 1)}; qf_rt=r`));
    expect(res.headers.get("set-cookie")).toContain("qf_at=");
    expect(await res.json()).toMatchObject({ label: "a@b.co" });
  });
});
