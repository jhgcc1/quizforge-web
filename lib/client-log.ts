/**
 * Browser error reports: sanitising and rate limiting. The browser cannot write to CloudWatch, so errors go to
 * POST /bff/client-log, which prints one JSON line to stdout (the container log group collects it).
 */

const MAX_FIELD = 500;
const MAX_STACK = 1500;

/** Removes what must never reach a log: tokens, e-mail addresses, query strings and long secrets. */
export function scrub(value: unknown, max = MAX_FIELD): string {
  return String(value ?? "")
    .replace(/\b(?:Bearer\s+)?eyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}\b/g, "[token]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/([?&][\w-]+=)[^\s&#"']+/g, "$1[redacted]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[secret]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .slice(0, max);
}

export interface ClientErrorReport { message: string; stack?: string; path: string; kind: string; digest?: string }

/** A report from untrusted input: unknown fields are dropped and every string is scrubbed and cut. */
export function sanitizeReport(input: unknown): ClientErrorReport | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  if (typeof r.message !== "string" || r.message.trim() === "") return null;
  const path = typeof r.path === "string" ? scrub(r.path.split(/[?#]/)[0], 200) : "";
  const kind = r.kind === "react" || r.kind === "window" || r.kind === "promise" ? r.kind : "other";
  return {
    message: scrub(r.message),
    ...(typeof r.stack === "string" ? { stack: scrub(r.stack, MAX_STACK) } : {}),
    path,
    kind,
    ...(typeof r.digest === "string" ? { digest: scrub(r.digest, 64) } : {}),
  };
}

/** Fixed-window limiter per key (client address). In memory per task: enough to stop a loop in one browser. */
export function createLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { start: number; n: number }>();
  return (key: string): boolean => {
    const t = now();
    const h = hits.get(key);
    if (!h || t - h.start >= windowMs) {
      if (hits.size > 5000) for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
      hits.set(key, { start: t, n: 1 });
      return true;
    }
    h.n += 1;
    return h.n <= limit;
  };
}

/** Browser side: fire and forget, never throws, never loops (one report per distinct message per page load). */
const sent = new Set<string>();
export function reportClientError(err: unknown, kind: ClientErrorReport["kind"], digest?: string): void {
  try {
    const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : "Unknown error");
    const key = `${kind}:${e.message}`;
    if (sent.has(key) || sent.size >= 10) return;
    sent.add(key);
    void fetch("/bff/client-log", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "content-type": "application/json", "x-requested-with": "quizforge" },
      body: JSON.stringify({ message: e.message, stack: e.stack, path: window.location.pathname, kind, digest }),
    }).catch(() => undefined);
  } catch { /* reporting must never break the page */ }
}
