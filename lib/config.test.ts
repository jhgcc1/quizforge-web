import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { webConfig } = await import("./config.js");

const cfg = (extra: Record<string, string> = {}) => webConfig({ NODE_ENV: "test", APP_URL: "https://app.example.com", ...extra });
const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;

describe("webConfig sign-up and social providers", () => {
  it("defaults: sign-up off, no providers", () => {
    const c = cfg();
    expect(c.allowSignup).toBe(false);
    expect(c.socialProviders).toEqual([]);
  });
  it("reads ALLOW_SIGNUP and SOCIAL_PROVIDERS", () => {
    const c = cfg({ ALLOW_SIGNUP: "true", SOCIAL_PROVIDERS: "google,facebook" });
    expect(c.allowSignup).toBe(true);
    expect(c.socialProviders).toEqual(["google", "facebook"]);
  });
  it("only the exact string true enables sign-up; unknown providers are ignored", () => {
    expect(cfg({ ALLOW_SIGNUP: "false" }).allowSignup).toBe(false);
    expect(cfg({ ALLOW_SIGNUP: "1" }).allowSignup).toBe(false);
    expect(cfg({ SOCIAL_PROVIDERS: "facebook,twitter" }).socialProviders).toEqual(["facebook"]);
  });
});

describe("webConfig", () => {
  it("defaults to cognito mode on localhost, trimming trailing slashes", () => {
    const c = webConfig(env({ COGNITO_DOMAIN: "https://auth.example.com/", API_URL: "http://api:8080/" }));
    expect(c).toMatchObject({ authMode: "cognito", cognitoDomain: "https://auth.example.com", apiUrl: "http://api:8080", appUrl: "http://localhost:3000", secureCookies: false, clientId: "", clientSecret: "", localSecret: "" });
  });
  it("marks cookies secure for https app urls", () => {
    expect(webConfig(env({ APP_URL: "https://quiz.example.com/" }))).toMatchObject({ appUrl: "https://quiz.example.com", secureCookies: true });
  });
  it("allows local auth only on localhost / 127.0.0.1", () => {
    expect(webConfig(env({ AUTH_MODE: "local", APP_URL: "http://127.0.0.1:3000", LOCAL_JWT_SECRET: "s" }))).toMatchObject({ authMode: "local", localSecret: "s" });
    expect(() => webConfig(env({ AUTH_MODE: "local", APP_URL: "https://quiz.example.com" }))).toThrow(/only allowed/);
    expect(() => webConfig(env({ AUTH_MODE: "local", APP_URL: "http://localhost.evil.com" }))).toThrow(/only allowed/);
  });
  it("reads process.env when no env is passed", () => {
    expect(webConfig().authMode).toBe(process.env.AUTH_MODE === "local" ? "local" : "cognito");
  });
});
