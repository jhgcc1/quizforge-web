import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { webConfig } = await import("./config.js");

const cfg = (extra: Record<string, string> = {}) => webConfig({ NODE_ENV: "test", APP_URL: "https://app.example.com", ...extra });

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
