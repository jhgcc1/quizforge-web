import "server-only";
import { createHash } from "node:crypto";
import type { WebConfig } from "./config";
import { peek } from "./session";

export interface Profile {
  sub: string | null;
  name?: string;
  email?: string;
  /** What the top bar shows: name, else e-mail, else a short id (never null when sub is known). */
  label: string | null;
}

const TTL_MS = 60_000;
const FAIL_TTL_MS = 15_000; // a failing userInfo is not retried on every page load
const TIMEOUT_MS = 3_000;
const MAX_ENTRIES = 500;
const cache = new Map<string, { at: number; ttl: number; data: { name?: string; email?: string } }>();

/** Test hook. */
export const clearProfileCache = () => cache.clear();

const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : undefined);

export function shortSub(sub: string | null): string | null {
  return sub === null ? null : sub.length > 14 ? `${sub.slice(0, 8)}…` : sub;
}

/** Cognito /oauth2/userInfo with the user's access token. Returns {} on any failure (network, timeout, 401, bad JSON). */
async function userInfo(cfg: WebConfig, token: string): Promise<{ name?: string; email?: string }> {
  try {
    const res = await fetch(`${cfg.cognitoDomain}/oauth2/userInfo`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return {};
    const j = (await res.json()) as Record<string, unknown>;
    const name = clean(j.name) ?? clean(j.preferred_username) ?? undefined;
    const email = clean(j.email);
    return { ...(name ? { name } : {}), ...(email ? { email } : {}) };
  } catch {
    return {};
  }
}

/**
 * The signed-in person for display. Cognito access tokens carry no name/e-mail, so the BFF asks userInfo (server side,
 * ~60 s in-memory cache keyed by a hash of the token). Local simulation reads the claims of the dev token instead.
 * Never throws: on failure the label falls back to the short account id.
 */
export async function loadProfile(cfg: WebConfig, token: string): Promise<Profile> {
  const claims = peek(token);
  const sub = claims?.sub ?? null;
  let data: { name?: string; email?: string };
  if (cfg.authMode === "local") {
    data = { ...(claims?.name ? { name: claims.name } : {}), ...(claims?.email ? { email: claims.email } : {}) };
  } else {
    const key = createHash("sha256").update(token).digest("hex");
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < hit.ttl) data = hit.data;
    else {
      data = await userInfo(cfg, token);
      if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
      cache.set(key, { at: Date.now(), ttl: data.name || data.email ? TTL_MS : FAIL_TTL_MS, data });
    }
  }
  return { sub, ...data, label: data.name ?? data.email ?? shortSub(sub) };
}
