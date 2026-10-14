import { afterEach, describe, expect, it, vi } from "vitest";
import { createLimiter, reportClientError, sanitizeReport, scrub } from "./client-log";

describe("scrub", () => {
  it("removes tokens, e-mail addresses, query strings and long secrets", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJlMTIz";
    const out = scrub(`failed for ana@example.com at /x?code=abc123&state=zz with Bearer ${jwt} and ${"a".repeat(40)}`);
    expect(out).not.toMatch(/ana@example|abc123|zz$|eyJ|aaaa/);
    expect(out).toContain("[email]");
    expect(out).toContain("[token]");
    expect(out).toContain("[secret]");
    expect(out).toContain("code=[redacted]");
  });
  it("cuts length, strips control characters and tolerates non-strings", () => {
    expect(scrub("ab ".repeat(300))).toHaveLength(500);
    expect(scrub("line1\nline2\u0000x")).toBe("line1 line2 x");
    expect(scrub(undefined)).toBe("");
  });
});

describe("sanitizeReport", () => {
  it("keeps only known fields and scrubs them", () => {
    const r = sanitizeReport({ message: "boom a@b.co", stack: "at x", path: "/app/quiz/1?token=abc", kind: "react", digest: "d1", extra: "dropped" });
    expect(r).toEqual({ message: "boom [email]", stack: "at x", path: "/app/quiz/1", kind: "react", digest: "d1" });
  });
  it("maps an unknown kind to other and omits absent fields", () => {
    expect(sanitizeReport({ message: "m", kind: "weird" })).toEqual({ message: "m", path: "", kind: "other" });
  });
  it("rejects non-objects and empty messages", () => {
    for (const bad of [null, "x", 3, {}, { message: "   " }, { message: 5 }]) expect(sanitizeReport(bad)).toBeNull();
  });
});

describe("createLimiter", () => {
  it("allows `limit` hits per window and per key, then resets", () => {
    let t = 0;
    const allow = createLimiter(2, 1000, () => t);
    expect([allow("a"), allow("a"), allow("a")]).toEqual([true, true, false]);
    expect(allow("b")).toBe(true);
    t = 1000;
    expect(allow("a")).toBe(true);
  });
  it("drops expired entries when the table grows large", () => {
    let t = 0;
    const allow = createLimiter(1, 10, () => t);
    for (let i = 0; i < 5001; i++) allow(`k${i}`);
    t = 100;
    expect(allow("fresh")).toBe(true);
  });
});

describe("reportClientError", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("posts once per distinct message and never throws", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { location: { pathname: "/app" } });
    reportClientError(new Error("one"), "window");
    reportClientError(new Error("one"), "window"); // duplicate: skipped
    reportClientError("two", "promise");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-requested-with"]).toBe("quizforge");
    expect(JSON.parse(init.body as string)).toMatchObject({ message: "one", path: "/app", kind: "window" });
  });
  it("is silent when fetch fails or window is missing", () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.stubGlobal("window", { location: { pathname: "/" } });
    expect(() => reportClientError(new Error("three"), "react")).not.toThrow();
    vi.stubGlobal("window", undefined);
    expect(() => reportClientError(new Error("four"), "react")).not.toThrow();
  });
});
