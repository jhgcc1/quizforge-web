import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { newPkce } from "./pkce.js";

describe("PKCE", () => {
  it("the challenge is the base64url SHA-256 of the verifier (RFC 7636 S256)", () => {
    const { verifier, challenge } = newPkce();
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("every call is unguessable and unique: verifier and state differ between calls", () => {
    const a = newPkce();
    const b = newPkce();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.state).not.toBe(b.state);
    expect(a.state).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
