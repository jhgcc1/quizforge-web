import { createHash, randomBytes } from "node:crypto";

const b64url = (b: Buffer) => b.toString("base64url");

export function newPkce() {
  const verifier = b64url(randomBytes(48));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()), state: b64url(randomBytes(24)) };
}
