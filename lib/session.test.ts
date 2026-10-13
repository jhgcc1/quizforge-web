import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebConfig } from "./config.js";

vi.mock("server-only", () => ({}));
const { AT, OAUTH, RT, clearSession, isFresh, peek, setSession, tokenRequest } = await import("./session.js");

const cfg: WebConfig = { authMode: "cognito", cognitoDomain: "https://auth.example.com", clientId: "cid", clientSecret: "sec", appUrl: "https://app.example.com", apiUrl: "http://api", localSecret: "", secureCookies: true, allowSignup: false, socialProviders: [] };
const jwt = (claims: Record<string, unknown>) => new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode("k".repeat(32)));
const inSeconds = (s: number) => Math.floor(Date.now() / 1000) + s;

afterEach(() => vi.unstubAllGlobals());

describe("session cookies", () => {
  it("setSession writes httpOnly, lax, secure cookies; the refresh token lives 30 days and is only set when present", () => {
    const res = NextResponse.json({});
    setSession(res, cfg, { access_token: "A", refresh_token: "R", expires_in: 3600 });
    expect(res.cookies.get(AT)).toMatchObject({ value: "A", httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 3600 });
    expect(res.cookies.get(RT)).toMatchObject({ value: "R", maxAge: 30 * 24 * 3600 });

    const res2 = NextResponse.json({});
    setSession(res2, { ...cfg, secureCookies: false }, { access_token: "A", expires_in: 5 });
    expect(res2.cookies.get(RT)).toBeUndefined();
    expect(res2.cookies.get(AT)).toMatchObject({ secure: false, maxAge: 60 }); // never shorter than a minute
  });

  it("clearSession expires the three cookies", () => {
    const res = NextResponse.json({});
    clearSession(res, cfg);
    for (const name of [AT, RT, OAUTH]) expect(res.cookies.get(name)).toMatchObject({ value: "", maxAge: 0 });
  });
});

describe("peek and isFresh", () => {
  it("reads sub and exp without verifying, and tolerates missing or malformed tokens", async () => {
    const exp = inSeconds(600);
    expect(peek(await jwt({ sub: "u1", exp }))).toEqual({ sub: "u1", exp });
    expect(peek(await jwt({}))).toEqual({});
    expect(peek("not-a-jwt")).toBeUndefined();
    expect(peek(undefined)).toBeUndefined();
  });

  it("a token is fresh only if it outlives the skew; no exp or no token is never fresh", async () => {
    expect(isFresh(await jwt({ exp: inSeconds(600) }))).toBe(true);
    expect(isFresh(await jwt({ exp: inSeconds(10) }))).toBe(false); // inside the 30 s skew
    expect(isFresh(await jwt({ exp: inSeconds(10) }), 5)).toBe(true);
    expect(isFresh(await jwt({ exp: inSeconds(-10) }))).toBe(false);
    expect(isFresh(await jwt({ sub: "x" }))).toBe(false);
    expect(isFresh(undefined)).toBe(false);
  });
});

describe("tokenRequest", () => {
  it("posts form-encoded params with Basic client auth and returns the tokens", async () => {
    const fetchFake = vi.fn(async () => new Response(JSON.stringify({ access_token: "A", refresh_token: "R", expires_in: 3600 })));
    vi.stubGlobal("fetch", fetchFake);
    const t = await tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: "old" });
    expect(t).toEqual({ access_token: "A", refresh_token: "R", expires_in: 3600 });
    const [url, init] = fetchFake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://auth.example.com/oauth2/token");
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("cid:sec").toString("base64")}`);
    const body = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(body)).toEqual({ client_id: "cid", grant_type: "refresh_token", refresh_token: "old" });
  });

  it("returns undefined on an error status or a body without an access token", async () => {
    vi.stubGlobal("fetch", async () => new Response("no", { status: 400 }));
    expect(await tokenRequest(cfg, {})).toBeUndefined();
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "x" })));
    expect(await tokenRequest(cfg, {})).toBeUndefined();
  });
});
