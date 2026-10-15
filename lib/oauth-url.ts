/** Pure helpers for the Cognito Hosted UI URL. No I/O, no secrets: easy to unit test. */

/** Strict allow-list: the value Cognito expects for `identity_provider`. Anything else is ignored. */
export const IDENTITY_PROVIDERS = { google: "Google", facebook: "Facebook" } as const;
export type SocialProvider = keyof typeof IDENTITY_PROVIDERS;

/** "google" | "facebook" (any case) -> the key, otherwise undefined. */
export function parseProvider(v: string | null | undefined): SocialProvider | undefined {
  const k = (v ?? "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(IDENTITY_PROVIDERS, k) ? (k as SocialProvider) : undefined;
}

/** "google, facebook,evil" -> ["google","facebook"] (unknown names and duplicates dropped). */
export function parseSocialProviders(v: string | undefined): SocialProvider[] {
  const out: SocialProvider[] = [];
  for (const part of (v ?? "").split(",")) {
    const p = parseProvider(part);
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

export const DEFAULT_SCOPES = "openid email";
const ALLOWED_SCOPES = ["openid", "email", "profile"];

/**
 * OAUTH_SCOPES -> a safe scope string. Only openid/email/profile are accepted and openid is mandatory; anything else
 * falls back to the default. `profile` must be allowed on the Cognito app client first, or the Hosted UI answers invalid_scope.
 */
export function parseScopes(v: string | undefined): string {
  const out: string[] = [];
  for (const part of (v ?? "").split(/[\s,]+/)) if (ALLOWED_SCOPES.includes(part) && !out.includes(part)) out.push(part);
  return out.includes("openid") ? out.join(" ") : DEFAULT_SCOPES;
}

export interface AuthorizeParams {
  cognitoDomain: string;
  clientId: string;
  appUrl: string;
  state: string;
  challenge: string;
  /** Space separated scopes; default "openid email". */
  scope?: string;
  /** "signup" opens the Hosted UI create-account page; default is the login page. */
  mode?: "login" | "signup";
  /** Raw value from the query string: only google/facebook are accepted. */
  provider?: string | null;
}

/**
 * Builds the Hosted UI URL. The redirect_uri is always built from the configured appUrl (never from user input),
 * so there is no open redirect.
 */
export function buildAuthorizeUrl(p: AuthorizeParams): URL {
  const path = p.mode === "signup" ? "/signup" : "/oauth2/authorize";
  const url = new URL(`${p.cognitoDomain.replace(/\/$/, "")}${path}`);
  const params: Record<string, string> = {
    response_type: "code",
    client_id: p.clientId,
    redirect_uri: `${p.appUrl}/auth/callback`,
    scope: p.scope ?? DEFAULT_SCOPES,
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
  };
  const provider = parseProvider(p.provider);
  // a social login goes straight to the provider; the sign-up page has no use for it
  if (provider && p.mode !== "signup") params.identity_provider = IDENTITY_PROVIDERS[provider];
  url.search = new URLSearchParams(params).toString();
  return url;
}
