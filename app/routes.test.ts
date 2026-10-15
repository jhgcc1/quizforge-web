import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ENV = { AUTH_MODE: "cognito", APP_URL: "https://app.example.com", API_URL: "http://api.test", COGNITO_DOMAIN: "https://auth.example.com", COGNITO_CLIENT_ID: "cid" };
const jwt = (exp: number) => new SignJWT({ sub: "u1", exp }).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode("k".repeat(32)));
const req = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => new NextRequest(url, init);

beforeEach(() => { for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("GET /bff/me", () => {
  it("is 401 without a session and returns the subject with a fresh token", async () => {
    const { GET } = await import("./bff/me/route.js");
    expect((await GET(req("https://app.example.com/bff/me"))).status).toBe(401);
    const at = await jwt(Math.floor(Date.now() / 1000) + 600);
    const res = await GET(req("https://app.example.com/bff/me", { headers: { cookie: `qf_at=${at}` } }));
    expect(res.status).toBe(200);
  });
});

describe("/bff/[...path]", () => {
  const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });
  it("404s outside /v1, blocks cross-site writes, and requires a session", async () => {
    const { GET, POST } = await import("./bff/[...path]/route.js");
    expect((await GET(req("https://app.example.com/bff/x"), ctx("x"))).status).toBe(404);
    expect((await POST(req("https://app.example.com/bff/v1/quizzes", { method: "POST", headers: { origin: "https://evil.com" }, body: "{}" }), ctx("v1", "quizzes"))).status).toBe(403);
    expect((await GET(req("https://app.example.com/bff/v1/quizzes"), ctx("v1", "quizzes"))).status).toBe(401);
  });
  it("rejects an invalid write body before calling the API", async () => {
    const at = await jwt(Math.floor(Date.now() / 1000) + 600);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("./bff/[...path]/route.js");
    const res = await POST(req("https://app.example.com/bff/v1/quizzes", { method: "POST", headers: { origin: "https://app.example.com", "x-requested-with": "quizforge", cookie: `qf_at=${at}`, "content-type": "application/json" }, body: "{not json" }), ctx("v1", "quizzes"));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("forwards an authenticated GET with a bearer token, passing selected response headers", async () => {
    const at = await jwt(Math.floor(Date.now() / 1000) + 600);
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json", "x-secret": "no" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { GET } = await import("./bff/[...path]/route.js");
    const res = await GET(req("https://app.example.com/bff/v1/quizzes?x=1", { headers: { cookie: `qf_at=${at}` } }), ctx("v1", "quizzes"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"ok":true}');
    expect(res.headers.get("x-secret")).toBeNull();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test/v1/quizzes?x=1");
    expect((init.headers as Headers).get("authorization")).toBe(`Bearer ${at}`);
  });
  it("answers 502 when the API is unreachable", async () => {
    const at = await jwt(Math.floor(Date.now() / 1000) + 600);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    const { GET } = await import("./bff/[...path]/route.js");
    const res = await GET(req("https://app.example.com/bff/v1/quizzes", { headers: { cookie: `qf_at=${at}` } }), ctx("v1", "quizzes"));
    expect(res.status).toBe(502);
    expect(res.headers.get("retry-after")).toBe("2");
  });
});

describe("auth login / logout", () => {
  it("login redirects to the Hosted UI with PKCE and a safe next path", async () => {
    const { GET } = await import("./auth/login/route.js");
    const res = GET(req("https://app.example.com/auth/login?next=//evil.com"));
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe("https://auth.example.com/oauth2/authorize");
    expect(loc.searchParams.get("code_challenge_method")).toBe("S256");
    expect(JSON.parse(decodeURIComponent(res.cookies.get("qf_oauth")!.value)).next).toBe("/app");
  });
  it("login without a provider does not force an identity provider; ?provider= and ?mode=signup still work", async () => {
    vi.stubEnv("SOCIAL_PROVIDERS", "google,facebook");
    vi.stubEnv("ALLOW_SIGNUP", "true");
    const { GET } = await import("./auth/login/route.js");
    const plain = new URL(GET(req("https://app.example.com/auth/login")).headers.get("location")!);
    expect(plain.searchParams.has("identity_provider")).toBe(false);
    const g = new URL(GET(req("https://app.example.com/auth/login?provider=google")).headers.get("location")!);
    expect(g.searchParams.get("identity_provider")).toBe("Google");
    const su = new URL(GET(req("https://app.example.com/auth/login?mode=signup")).headers.get("location")!);
    expect(su.pathname).toBe("/signup");
  });
  it("local mode: login goes to the dev route and logout returns home", async () => {
    vi.stubEnv("AUTH_MODE", "local");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    const login = (await import("./auth/login/route.js")).GET(req("http://localhost:3000/auth/login"));
    expect(new URL(login.headers.get("location")!).pathname).toBe("/auth/dev");
    const out = (await import("./auth/logout/route.js")).POST(req("http://localhost:3000/auth/logout", { method: "POST" }));
    expect(new URL(out.headers.get("location")!).pathname).toBe("/");
  });
  it("logout is a 303 to the Hosted UI logout and clears the session", async () => {
    const { POST } = await import("./auth/logout/route.js");
    const res = POST(req("https://app.example.com/auth/logout", { method: "POST" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("https://auth.example.com/logout?");
    expect(res.cookies.get("qf_at")?.value).toBe("");
  });
});
