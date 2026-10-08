/** Browser-side API client: talks to the BFF, retries safely, and keeps Idempotency-Keys stable across retries. */

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

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<{ data: T; replayed: boolean; status: number }> {
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
    return { data: json as T, replayed: res.headers.get("idempotency-replayed") === "true", status: res.status };
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

/* ---------- response types (kept in sync with the API by hand; no server code is imported) ---------- */
export type QuizStatus = "queued" | "generating" | "ready" | "failed";
export interface QuizSummary {
  id: string;
  status: QuizStatus;
  sourceUrl: string;
  topic: string | null;
  numQuestions: number;
  strategyRequested: string;
  strategyUsed: string | null;
  critique: boolean;
  error: string | null;
  createdAt: string;
}
export interface PublicQuestion {
  id: string;
  position: number;
  prompt: string;
  type: "single" | "multiple";
  difficulty: "easy" | "medium" | "hard";
  options: { id: string; position: number; text: string }[];
}
export interface SavedAnswer {
  questionId: string;
  optionIds: string[];
  revision: number;
}
export interface AttemptResult {
  attemptId: string;
  quizId: string;
  status: "in_progress" | "submitted";
  finalScore: number | null;
  percent: number | null;
  questions: {
    id: string;
    position: number;
    prompt: string;
    type: "single" | "multiple";
    explanation: string;
    sourceQuote: string;
    score: number | null;
    weight: number | null;
    options: { id: string; position: number; text: string; isCorrect: boolean; selected: boolean }[];
  }[];
}
