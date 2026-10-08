import "server-only";
import type { NextResponse } from "next/server";
import { decodeJwt } from "jose";
import type { WebConfig } from "./config";

export const AT = "qf_at";
export const RT = "qf_rt";
export const OAUTH = "qf_oauth";

export interface Tokens {
  access_token: string;
  refresh_token?: string | undefined;
  expires_in: number;
}

const base = (cfg: WebConfig) => ({ httpOnly: true, secure: cfg.secureCookies, sameSite: "lax" as const, path: "/" });

export function setSession(res: NextResponse, cfg: WebConfig, t: Tokens): void {
  res.cookies.set(AT, t.access_token, { ...base(cfg), maxAge: Math.max(60, t.expires_in) });
  if (t.refresh_token) res.cookies.set(RT, t.refresh_token, { ...base(cfg), maxAge: 30 * 24 * 3600 });
}

export function clearSession(res: NextResponse, cfg: WebConfig): void {
  for (const name of [AT, RT, OAUTH]) res.cookies.set(name, "", { ...base(cfg), maxAge: 0 });
}

/** Unverified decode, for expiry checks and display only. The API verifies every token it receives. */
export function peek(token: string | undefined): { sub?: string; exp?: number } | undefined {
  if (!token) return undefined;
  try {
    const p = decodeJwt(token);
    return { ...(p.sub ? { sub: p.sub } : {}), ...(p.exp ? { exp: p.exp } : {}) };
  } catch {
    return undefined;
  }
}

export const isFresh = (token: string | undefined, skewSeconds = 30) => {
  const exp = peek(token)?.exp;
  return exp !== undefined && exp - skewSeconds > Date.now() / 1000;
};

/** Cognito token endpoint (authorization_code or refresh_token), authenticated as the confidential client. */
export async function tokenRequest(cfg: WebConfig, params: Record<string, string>): Promise<Tokens | undefined> {
  const res = await fetch(`${cfg.cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ client_id: cfg.clientId, ...params }),
    cache: "no-store",
  });
  if (!res.ok) return undefined;
  const j = (await res.json()) as Tokens;
  return j.access_token ? j : undefined;
}
