// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const cookieGet = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookieGet }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); },
}));

import Landing from "./page";

const sp = (error?: string) => Promise.resolve({ error });
const setEnv = (mode: "cognito" | "local") => {
  vi.stubEnv("AUTH_MODE", mode);
  vi.stubEnv("APP_URL", mode === "local" ? "http://localhost:3000" : "https://app.example.com");
};

beforeEach(() => { cookieGet.mockReset(); cookieGet.mockReturnValue(undefined); });
afterEach(() => vi.unstubAllEnvs());

describe("landing in cognito mode", () => {
  beforeEach(() => setEnv("cognito"));
  it("sends an anonymous visitor straight to the login (Hosted UI)", async () => {
    await expect(Landing({ searchParams: sp() })).rejects.toThrow("REDIRECT:/auth/login");
  });
  it("sends a visitor with a session to the app", async () => {
    cookieGet.mockImplementation((n: string) => (n === "qf_rt" ? { value: "x" } : undefined));
    await expect(Landing({ searchParams: sp() })).rejects.toThrow("REDIRECT:/app");
  });
  it("shows the error and a Try again button instead of redirecting (no loop)", async () => {
    render(await Landing({ searchParams: sp("invalid_state") }));
    expect(screen.getByRole("alert").textContent).toContain("expired");
    expect(screen.getByRole("link", { name: "Try again" }).getAttribute("href")).toBe("/auth/login");
    expect(screen.queryByText("Turn any README into a quiz")).toBeNull();
  });
  it("falls back to a generic message for an unknown error code", async () => {
    render(await Landing({ searchParams: sp("whatever") }));
    expect(screen.getByRole("alert").textContent).toBe("Sign-in failed.");
  });
});

describe("landing in local mode (kept for the back end e2e)", () => {
  beforeEach(() => {
    setEnv("local");
    vi.stubEnv("ALLOW_SIGNUP", "true");
    vi.stubEnv("SOCIAL_PROVIDERS", "google,facebook");
  });
  it("keeps the sign-in, create-account and social links", async () => {
    render(await Landing({ searchParams: sp() }));
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/auth/login");
    expect(screen.getByRole("link", { name: "Create account" }).getAttribute("href")).toBe("/auth/login?mode=signup");
    expect(screen.getByRole("link", { name: "Continue with Google" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue with Facebook" })).toBeTruthy();
  });
  it("shows an error message when present", async () => {
    render(await Landing({ searchParams: sp("login_denied") }));
    expect(screen.getByRole("alert").textContent).toContain("cancelled");
  });
  it("redirects with a session", async () => {
    cookieGet.mockReturnValue({ value: "x" });
    await expect(Landing({ searchParams: sp() })).rejects.toThrow("REDIRECT:/app");
  });
});
