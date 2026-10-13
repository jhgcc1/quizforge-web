import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, api, newKey } from "./api.js";

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, ...init });
type Call = [string, RequestInit & { headers: Record<string, string> }];

function stubFetch(...responses: (Response | Error)[]) {
  const fn = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra fetch");
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls: () => fn.mock.calls as unknown as Call[] };
}
/** Runs the call to completion while letting the backoff timers fire. */
async function settle<T>(p: Promise<T>): Promise<T> {
  const guarded = p.then((v) => ({ v }), (e: unknown) => ({ e }));
  await vi.runAllTimersAsync();
  const r = await guarded;
  if ("e" in r) throw r.e;
  return r.v;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("api client", () => {
  it("a non-JSON error body (e.g. an HTML gateway page) still yields a generic ApiError with the status", async () => {
    stubFetch(new Response("<html>Bad gateway</html>", { status: 400 }));
    await expect(api("/v1/x")).rejects.toMatchObject({ status: 400, code: "error", message: "Request failed (400)" });
  });

  it("GET: sends to the BFF with same-origin credentials and no CSRF header or body, and returns the JSON", async () => {
    const f = stubFetch(json({ a: 1 }));
    const r = await api("/v1/quizzes");
    expect(r).toEqual({ data: { a: 1 }, replayed: false, status: 200 });
    const [url, init] = f.calls()[0]!;
    expect(url).toBe("/bff/v1/quizzes");
    expect(init).toMatchObject({ method: "GET", credentials: "same-origin" });
    expect(init.headers).toEqual({ accept: "application/json" });
    expect(init.body).toBeUndefined();
  });

  it("POST: sends the body, the idempotency key and the CSRF header; reports a replayed response", async () => {
    const f = stubFetch(json({ id: "q" }, { status: 201, headers: { "idempotency-replayed": "true" } }));
    const r = await api("/v1/quizzes", { method: "POST", body: { n: 6 }, idempotencyKey: "key-1" });
    expect(r).toMatchObject({ replayed: true, status: 201 });
    const [, init] = f.calls()[0]!;
    expect(init.body).toBe('{"n":6}');
    expect(init.headers).toMatchObject({ "content-type": "application/json", "idempotency-key": "key-1", "x-requested-with": "quizforge" });
  });

  it("passes the abort signal through, and an abort is never retried or wrapped", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const f = stubFetch(abort);
    const ac = new AbortController();
    await expect(api("/x", { signal: ac.signal })).rejects.toBe(abort);
    expect(f.fn).toHaveBeenCalledTimes(1);
    expect(f.calls()[0]![1].signal).toBe(ac.signal);
  });

  it("retries a network error on GET and succeeds; gives a network ApiError once the retries are used up", async () => {
    const ok = stubFetch(new TypeError("down"), json({ ok: true }));
    expect((await settle(api("/x"))).data).toEqual({ ok: true });
    expect(ok.fn).toHaveBeenCalledTimes(2);

    const bad = stubFetch(...Array.from({ length: 4 }, () => new TypeError("down")));
    const err = await settle(api("/x")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, code: "network" });
    expect(bad.fn).toHaveBeenCalledTimes(4); // first try + 3 retries
  });

  it("a plain POST (no idempotency key) is not retried, but with a key or an explicit count it is", async () => {
    const a = stubFetch(new TypeError("down"));
    await expect(settle(api("/x", { method: "POST", body: {} }))).rejects.toMatchObject({ code: "network" });
    expect(a.fn).toHaveBeenCalledTimes(1);

    const b = stubFetch(new TypeError("down"), json({}));
    await settle(api("/x", { method: "POST", idempotencyKey: "k" }));
    expect(b.fn).toHaveBeenCalledTimes(2);

    const c = stubFetch(new TypeError("down"), json({}));
    await settle(api("/x", { method: "POST", retries: 1 }));
    expect(c.fn).toHaveBeenCalledTimes(2);

    const d = stubFetch(new TypeError("down"), json({}));
    await settle(api("/x", { method: "PUT", body: {} })); // PUT is idempotent
    expect(d.fn).toHaveBeenCalledTimes(2);
  });

  it("retries 429/5xx honouring Retry-After (capped at 10 s) and falls back to backoff without it", async () => {
    const f = stubFetch(new Response("", { status: 503, headers: { "retry-after": "2" } }), new Response("", { status: 429 }), new Response("", { status: 504, headers: { "retry-after": "999" } }), json({ done: 1 }));
    const timeout = vi.spyOn(globalThis, "setTimeout");
    const r = await settle(api("/x"));
    expect(r.data).toEqual({ done: 1 });
    expect(f.fn).toHaveBeenCalledTimes(4);
    const delays = timeout.mock.calls.map((c) => c[1]);
    expect(delays[0]).toBe(2000);
    expect(delays[1]).toBeGreaterThanOrEqual(0.7 * 800);
    expect(delays[1]).toBeLessThanOrEqual(1.3 * 800);
    expect(delays[2]).toBe(10_000);
  });

  it("does not retry a 4xx and turns the API error body into an ApiError with code, message and details", async () => {
    const f = stubFetch(json({ error: { code: "validation_error", message: "bad", details: [{ path: "n" }] } }, { status: 400 }));
    const err = await api("/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: "validation_error", message: "bad", details: [{ path: "n" }] });
    expect(f.fn).toHaveBeenCalledTimes(1);
  });

  it("a failing response without a JSON error body still yields a generic ApiError, also after exhausting retries on 5xx", async () => {
    stubFetch(new Response("<html>oops</html>", { status: 500 }));
    await expect(api("/x")).rejects.toMatchObject({ status: 500, code: "error", message: "Request failed (500)" });
    stubFetch(...Array.from({ length: 4 }, () => new Response("", { status: 502 })));
    await expect(settle(api("/x"))).rejects.toMatchObject({ status: 502, code: "error" });
  });

  it("a 401 in the browser sends the user to the login page, returning to the current path", async () => {
    stubFetch(new Response("", { status: 401 }));
    const win = { location: { href: "", pathname: "/quizzes/a b" } };
    vi.stubGlobal("window", win);
    await expect(api("/x")).rejects.toMatchObject({ status: 401, code: "unauthenticated" });
    expect(win.location.href).toBe("/auth/login?next=%2Fquizzes%2Fa%20b");
  });

  it("a 401 without a window (server side) is a plain ApiError", async () => {
    stubFetch(json({ error: { code: "unauthenticated", message: "Sign in required" } }, { status: 401 }));
    await expect(api("/x")).rejects.toMatchObject({ status: 401, code: "unauthenticated", message: "Sign in required" });
  });

  it("validates a successful body against the schema: valid data is returned parsed, a mismatch is a 502 bad_response", async () => {
    const schema = z.object({ n: z.coerce.number() });
    stubFetch(json({ n: "4" }));
    expect((await api("/x", { schema })).data).toEqual({ n: 4 });

    stubFetch(json({ n: "four" }));
    const err = await api("/x", { schema }).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 502, code: "bad_response" });
    expect((err as ApiError).details).toHaveLength(1);
  });

  it("an empty or non-JSON success body is null data", async () => {
    stubFetch(new Response(null, { status: 204 }));
    expect((await api("/x")).data).toBeNull();
    stubFetch(new Response("not json", { status: 200 }));
    expect((await api("/x")).data).toBeNull();
  });
});

describe("newKey", () => {
  it("is unique per call", () => {
    expect(newKey()).not.toBe(newKey());
  });

  it("falls back to a time-based key where crypto.randomUUID does not exist", () => {
    vi.stubGlobal("crypto", {});
    expect(newKey()).toMatch(/^k-\d+-[a-z0-9]+$/);
  });
});
