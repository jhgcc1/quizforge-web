import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ENV = { AUTH_MODE: "cognito", APP_URL: "https://app.example.com", API_URL: "http://api.test", COGNITO_DOMAIN: "https://auth.example.com", COGNITO_CLIENT_ID: "cid" };
const post = (body: string, headers: Record<string, string> = {}) =>
  new NextRequest("https://app.example.com/bff/client-log", { method: "POST", body, headers: { origin: "https://app.example.com", "x-requested-with": "quizforge", ...headers } });

beforeEach(() => { for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("POST /bff/client-log", () => {
  it("logs one scrubbed JSON line and answers 204, without a session", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { POST } = await import("./bff/client-log/route.js");
    const res = await POST(post(JSON.stringify({ message: "boom ana@example.com", path: "/app?x=1", kind: "window" }), { "x-forwarded-for": "9.9.9.1" }));
    expect(res.status).toBe(204);
    const line = JSON.parse(log.mock.calls[0]![0] as string);
    expect(line).toMatchObject({ level: "error", msg: "client_error", service: "web", message: "boom [email]", path: "/app", kind: "window" });
  });
  it("rejects cross-site, oversized, malformed and empty reports", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { POST } = await import("./bff/client-log/route.js");
    expect((await POST(post("{}", { origin: "https://evil.com", "x-forwarded-for": "9.9.9.2" }))).status).toBe(403);
    expect((await POST(post("x".repeat(5000), { "x-forwarded-for": "9.9.9.2" }))).status).toBe(413);
    expect((await POST(post("{not json", { "x-forwarded-for": "9.9.9.2" }))).status).toBe(400);
    expect((await POST(post("{}", { "x-forwarded-for": "9.9.9.2" }))).status).toBe(422);
  });
  it("rate limits one address after 20 reports a minute", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { POST } = await import("./bff/client-log/route.js");
    const body = JSON.stringify({ message: "m" });
    const codes: number[] = [];
    for (let i = 0; i < 22; i++) codes.push((await POST(post(body, { "x-forwarded-for": "9.9.9.3" }))).status);
    expect(codes.slice(0, 20).every((c) => c === 204)).toBe(true);
    expect(codes.slice(20)).toEqual([429, 429]);
    expect((await POST(post(body))).status).toBe(204); // no forwarded address: its own bucket
  });
});
