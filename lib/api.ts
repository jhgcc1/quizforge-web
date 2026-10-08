/**
 * Browser-side API client: talks to the BFF, retries safely, keeps Idempotency-Keys stable across retries, and
 * validates every successful response against the schema it was given (shared with the API through @quizforge/core).
 */
import type { ZodTypeAny, z } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const newKey = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  /** Required for POSTs that create things. The SAME key is reused across retries of one user action. */
  idempotencyKey?: string;
  retries?: number;
  signal?: AbortSignal;
}

/** Only transient failures are retried (network, 429, 5xx); 4xx are the caller's problem. */
const retryable = (status: number) => status === 429 || status === 502 || status === 503 || status === 504;

export async function api<S extends ZodTypeAny = ZodTypeAny>(path: string, opts: ApiOptions & {
    /** Response contract. A body that does not match is rejected instead of being trusted. */
    schema?: S;
  } = {}): Promise<{ data: z.output<S>; replayed: boolean; status: number }> {
  const method = opts.method ?? "GET";
  const maxRetries = opts.retries ?? (method === "GET" || opts.idempotencyKey || method === "PUT" ? 3 : 0);
  for (let attempt = 0; ; attempt++) {
    let res: Response | undefined;
    try {
      res = await fetch(`/bff${path}`, {
        method,
        credentials: "same-origin",
        ...(opts.signal ? { signal: opts.signal } : {}),
        headers: {
          accept: "application/json",
          ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
          ...(opts.idempotencyKey ? { "idempotency-key": opts.idempotencyKey } : {}),
          ...(method !== "GET" ? { "x-requested-with": "quizforge" } : {}),
        },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      if (attempt >= maxRetries) throw new ApiError(0, "network", "Network error, check your connection");
      await sleep(backoff(attempt));
      continue;
    }
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = `/auth/login?next=${encodeURIComponent(window.location.pathname)}`;
      throw new ApiError(401, "unauthenticated", "Signing in...");
    }
    if (retryable(res.status) && attempt < maxRetries) {
      const ra = Number(res.headers.get("retry-after"));
      await sleep(ra > 0 ? Math.min(ra * 1000, 10_000) : backoff(attempt));
      continue;
    }
    const text = await res.text();
    const json = text ? safeJson(text) : null;
    if (!res.ok) {
      const e = (json as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
      throw new ApiError(res.status, e?.code ?? "error", e?.message ?? `Request failed (${res.status})`, e?.details);
    }
    if (opts.schema) {
      const parsed = opts.schema.safeParse(json);
      if (!parsed.success) throw new ApiError(502, "bad_response", "The server sent an unexpected response. Try again in a moment.", parsed.error.issues.slice(0, 3));
      return { data: parsed.data, replayed: res.headers.get("idempotency-replayed") === "true", status: res.status };
    }
    return { data: json as z.output<S>, replayed: res.headers.get("idempotency-replayed") === "true", status: res.status };
  }
}

const backoff = (attempt: number) => Math.min(8000, 400 * 2 ** attempt) * (0.7 + Math.random() * 0.6);
const safeJson = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

/* Response types come from the shared schemas, so the browser and the API cannot drift. */
export type { AttemptResult, CatalogEntry, PublicQuestion, QuizSummary, SavedAnswer } from "@quizforge/core/schemas";
export type QuizStatus = "queued" | "generating" | "ready" | "failed";
