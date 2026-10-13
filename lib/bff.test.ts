import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebConfig } from "./config.js";

vi.mock("server-only", () => ({}));
const { accessToken, csrfOk, unauthorized } = await import("./bff.js");

const cfg: WebConfig = { authMode: "cognito", cognitoDomain: "https://auth.example.com", clientId: "cid", clientSecret: "sec", appUrl: "https://app.example.com", apiUrl: "http://api", localSecret: "", secureCookies: true, allowSignup: false, socialProviders: [] };
const jwt = (exp: number) => new SignJWT({ sub: "u" }).setExpirationTime(exp).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode("k".repeat(32)));
const now = () => Math.floor(Date.now() / 1000);
const req = (cookies: Record<string, string> = {}, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest("https://app.example.com/bff/v1/x", { method: init.method ?? "GET", headers: { ...(Object.keys(cookies).length ? { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") } : {}), ...init.headers } });

afterEach(() => vi.unstubAllGlobals());

describe("accessToken", () => {
  it("uses the cookie as is while it is fresh (no network)", async () => {
    const fetchFake = vi.fn();
    vi.stubGlobal("fetch", fetchFake);
    const at = await jwt(now() + 600);
    expect(await accessToken(req({ qf_at: at }), cfg)).toEqual({ token: at });
    expect(fetchFake).not.toHaveBeenCalled();
  });

  it("refreshes an expired token with the refresh token and hands the new tokens back to be written to the response", async () => {
    const fresh = { access_token: "NEW", refresh_token: "R2", expires_in: 3600 };
    const fetchFake = vi.fn(async () => new Response(JSON.stringify(fresh)));
    vi.stubGlobal("fetch", fetchFake);
    const r = await accessToken(req({ qf_at: await jwt(now() - 5), qf_rt: "R1" }), cfg);
    expect(r).toEqual({ token: "NEW", refreshed: fresh });
    expect(String((fetchFake.mock.calls[0] as unknown as [string, RequestInit])[1].body)).toContain("refresh_token=R1");
  });

  it("gives nothing when the refresh fails, there is no refresh token, or auth is local", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 400 }));
    expect(await accessToken(req({ qf_rt: "R1" }), cfg)).toEqual({});
    expect(await accessToken(req(), cfg)).toEqual({});
    const fetchFake = vi.fn();
    vi.stubGlobal("fetch", fetchFake);
    expect(await accessToken(req({ qf_rt: "R1" }), { ...cfg, authMode: "local" })).toEqual({});
    expect(fetchFake).not.toHaveBeenCalled();
  });
});

describe("csrfOk", () => {
  it("reads never need the header", () => {
    expect(csrfOk(req(), cfg)).toBe(true);
    expect(csrfOk(req({}, { method: "HEAD" }), cfg)).toBe(true);
  });

  it("unsafe methods need our own origin AND the custom header", () => {
    const ok = { origin: "https://app.example.com", "x-requested-with": "quizforge" };
    expect(csrfOk(req({}, { method: "POST", headers: ok }), cfg)).toBe(true);
    expect(csrfOk(req({}, { method: "PUT", headers: { ...ok, origin: "https://evil.example" } }), cfg)).toBe(false);
    expect(csrfOk(req({}, { method: "POST", headers: { origin: ok.origin } }), cfg)).toBe(false);
    expect(csrfOk(req({}, { method: "POST", headers: { "x-requested-with": "quizforge" } }), cfg)).toBe(false);
  });
});

describe("unauthorized", () => {
  it("is a 401 with the API's error shape", async () => {
    const r = unauthorized();
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: { code: "unauthenticated", message: "Sign in required" } });
  });
});
