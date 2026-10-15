import { describe, expect, it } from "vitest";
import { DEFAULT_SCOPES, buildAuthorizeUrl, parseScopes, parseProvider, parseSocialProviders } from "./oauth-url.js";

const base = { cognitoDomain: "https://x.auth.eu-west-1.amazoncognito.com/", clientId: "cid", appUrl: "https://app.example.com", state: "st", challenge: "ch" };

describe("buildAuthorizeUrl", () => {
  it("builds the login URL with the PKCE params", () => {
    const u = buildAuthorizeUrl(base);
    expect(u.origin + u.pathname).toBe("https://x.auth.eu-west-1.amazoncognito.com/oauth2/authorize");
    const q = u.searchParams;
    expect(q.get("response_type")).toBe("code");
    expect(q.get("client_id")).toBe("cid");
    expect(q.get("redirect_uri")).toBe("https://app.example.com/auth/callback");
    expect(q.get("scope")).toBe("openid email");
    expect(q.get("state")).toBe("st");
    expect(q.get("code_challenge")).toBe("ch");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.has("identity_provider")).toBe(false);
  });

  it("uses /signup for create account, with the same params", () => {
    const u = buildAuthorizeUrl({ ...base, mode: "signup" });
    expect(u.pathname).toBe("/signup");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("redirect_uri")).toBe("https://app.example.com/auth/callback");
  });

  it("passes only allow-listed identity providers", () => {
    expect(buildAuthorizeUrl({ ...base, provider: "google" }).searchParams.get("identity_provider")).toBe("Google");
    expect(buildAuthorizeUrl({ ...base, provider: "Facebook" }).searchParams.get("identity_provider")).toBe("Facebook");
    for (const bad of ["COGNITO", "Amazon", "google&x=1", "https://evil.test", "", null, undefined, "__proto__", "constructor"]) {
      expect(buildAuthorizeUrl({ ...base, provider: bad }).searchParams.has("identity_provider")).toBe(false);
    }
  });

  it("never takes the redirect target from user input", () => {
    const u = buildAuthorizeUrl({ ...base, provider: "google" });
    expect(new URL(u.searchParams.get("redirect_uri")!).origin).toBe("https://app.example.com");
  });
});

describe("provider parsing", () => {
  it("parseProvider", () => {
    expect(parseProvider(" GOOGLE ")).toBe("google");
    expect(parseProvider("twitter")).toBeUndefined();
  });
  it("parseSocialProviders drops unknown names and duplicates", () => {
    expect(parseSocialProviders("google, facebook,evil,google")).toEqual(["google", "facebook"]);
    expect(parseSocialProviders("")).toEqual([]);
    expect(parseSocialProviders(undefined)).toEqual([]);
  });
});

describe("scopes", () => {
  it("default scope is openid email (safe until the Cognito client allows profile)", () => {
    expect(buildAuthorizeUrl(base).searchParams.get("scope")).toBe("openid email");
    expect(DEFAULT_SCOPES).toBe("openid email");
  });
  it("an explicit scope is used on login and sign-up", () => {
    expect(buildAuthorizeUrl({ ...base, scope: "openid email profile" }).searchParams.get("scope")).toBe("openid email profile");
    expect(buildAuthorizeUrl({ ...base, scope: "openid email profile", mode: "signup" }).searchParams.get("scope")).toBe("openid email profile");
  });
  it("parseScopes accepts spaces or commas, drops unknown and duplicates, requires openid", () => {
    expect(parseScopes("openid email profile")).toBe("openid email profile");
    expect(parseScopes("openid,email, profile ,profile,aws.cognito.signin.user.admin")).toBe("openid email profile");
    expect(parseScopes("email profile")).toBe("openid email");
    expect(parseScopes("")).toBe("openid email");
    expect(parseScopes(undefined)).toBe("openid email");
  });
});
