import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebConfig } from "./config";

vi.mock("server-only", () => ({}));
const { loadProfile, clearProfileCache, shortSub } = await import("./profile.js");

const cfg: WebConfig = { authMode: "cognito", cognitoDomain: "https://auth.example.com", clientId: "c", clientSecret: "s", appUrl: "https://app.example.com", apiUrl: "http://api", localSecret: "", secureCookies: true, allowSignup: false, socialProviders: [], oauthScopes: "openid email profile" };
const jwt = (claims: Record<string, unknown>) => new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode("k".repeat(32)));
const SUB = "91fb15b0-1111-2222-3333-444455556666";
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });

beforeEach(() => clearProfileCache());
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("loadProfile (cognito)", () => {
  it("name from userInfo wins, e-mail is kept, token goes only to Cognito as a bearer", async () => {
    const f = vi.fn().mockResolvedValue(json({ sub: SUB, name: "Ana Souza", email: "ana@example.com" }));
    vi.stubGlobal("fetch", f);
    const t = await jwt({ sub: SUB });
    expect(await loadProfile(cfg, t)).toEqual({ sub: SUB, name: "Ana Souza", email: "ana@example.com", label: "Ana Souza" });
    expect(f.mock.calls[0]![0]).toBe("https://auth.example.com/oauth2/userInfo");
    expect(f.mock.calls[0]![1].headers.authorization).toBe(`Bearer ${t}`);
  });
  it("only e-mail: label is the e-mail; preferred_username is used when there is no name", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ email: " a@b.co " })));
    expect(await loadProfile(cfg, await jwt({ sub: SUB }))).toEqual({ sub: SUB, email: "a@b.co", label: "a@b.co" });
    clearProfileCache();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ preferred_username: "ana", email: "a@b.co" })));
    expect(await loadProfile(cfg, await jwt({ sub: SUB }))).toMatchObject({ name: "ana", label: "ana" });
  });
  it("no data, 401, bad json, network error and timeout all fall back to the short sub", async () => {
    const t = await jwt({ sub: SUB });
    for (const f of [
      vi.fn().mockResolvedValue(json({})),
      vi.fn().mockResolvedValue(json({ name: 5, email: "  " })),
      vi.fn().mockResolvedValue(json({ error: "invalid_token" }, 401)),
      vi.fn().mockResolvedValue(new Response("<html>", { status: 200 })),
      vi.fn().mockRejectedValue(new Error("network")),
      vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")),
    ]) {
      clearProfileCache();
      vi.stubGlobal("fetch", f);
      expect(await loadProfile(cfg, t)).toEqual({ sub: SUB, label: "91fb15b0…" });
    }
  });
  it("asks userInfo with a timeout signal", async () => {
    const f = vi.fn().mockResolvedValue(json({ name: "A" }));
    vi.stubGlobal("fetch", f);
    await loadProfile(cfg, await jwt({ sub: SUB }));
    expect(f.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal);
  });
  it("caches for 60 s (hit), then asks again; failures are cached only briefly", async () => {
    vi.useFakeTimers();
    const f = vi.fn().mockResolvedValue(json({ name: "Ana" }));
    vi.stubGlobal("fetch", f);
    const t = await jwt({ sub: SUB });
    await loadProfile(cfg, t); await loadProfile(cfg, t);
    expect(f).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(61_000);
    await loadProfile(cfg, t);
    expect(f).toHaveBeenCalledTimes(2);
    const g = vi.fn().mockResolvedValue(json({}, 401));
    vi.stubGlobal("fetch", g);
    const u = await jwt({ sub: "other" });
    await loadProfile(cfg, u); await loadProfile(cfg, u);
    expect(g).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(16_000);
    await loadProfile(cfg, u);
    expect(g).toHaveBeenCalledTimes(2);
  });
  it("the cache is bounded", async () => {
    const f = vi.fn().mockResolvedValue(json({ name: "A" }));
    vi.stubGlobal("fetch", f);
    for (let i = 0; i < 501; i++) await loadProfile(cfg, await jwt({ sub: `u${i}` }));
    await loadProfile(cfg, await jwt({ sub: "u0" })); // evicted: asked again
    expect(f).toHaveBeenCalledTimes(502);
  });
  it("a token without sub still yields an empty label", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({})));
    expect(await loadProfile(cfg, await jwt({}))).toEqual({ sub: null, label: null });
  });
});

describe("loadProfile (local simulation)", () => {
  it("reads claims of the dev token and never calls Cognito", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const local = { ...cfg, authMode: "local" as const };
    expect(await loadProfile(local, await jwt({ sub: "dev-user", name: "dev-user", email: "dev-user@local.test" }))).toEqual({ sub: "dev-user", name: "dev-user", email: "dev-user@local.test", label: "dev-user" });
    expect(await loadProfile(local, await jwt({ sub: "x" }))).toEqual({ sub: "x", label: "x" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("shortSub", () => {
  it("shortens long ids only", () => {
    expect(shortSub(SUB)).toBe("91fb15b0…");
    expect(shortSub("u1")).toBe("u1");
    expect(shortSub(null)).toBeNull();
  });
});
