import { describe, expect, it } from "vitest";
import { validateBody } from "./validate.js";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("BFF request validation (same schemas as the API)", () => {
  it("accepts a valid create-quiz body and lets other routes through untouched", () => {
    expect(validateBody("POST", ["v1", "quizzes"], JSON.stringify({ sourceUrl: "https://github.com/a/b/blob/main/README.md", numQuestions: 6 }))).toBeUndefined();
    expect(validateBody("GET", ["v1", "quizzes"], undefined)).toBeUndefined();
    expect(validateBody("POST", ["v1", "attempts", uuid, "submit"], "{}")).toBeUndefined();
  });

  it("rejects out-of-range, unknown and malformed create-quiz bodies with the API's error shape", () => {
    for (const body of [{ numQuestions: 3 }, { numQuestions: 9 }, { sourceUrl: "not a url" }, { strategy: "magic" }, { extra: true }, { topic: "x" }]) {
      const r = validateBody("POST", ["v1", "quizzes"], JSON.stringify(body));
      expect(r?.status, JSON.stringify(body)).toBe(400);
      expect(r?.body.error.code).toBe("validation_error");
    }
    expect(validateBody("POST", ["v1", "quizzes"], "{not json")?.body.error.message).toMatch(/not valid JSON/);
  });

  it("validates the answer body: option ids must be UUIDs, 1 to 4 of them, with a revision", () => {
    const path = ["v1", "attempts", uuid, "answers", uuid];
    expect(validateBody("PUT", path, JSON.stringify({ optionIds: [uuid], revision: 1 }))).toBeUndefined();
    for (const body of [{ optionIds: [], revision: 1 }, { optionIds: ["x"], revision: 1 }, { optionIds: [uuid] }, { optionIds: [uuid, uuid, uuid, uuid, uuid], revision: 1 }]) {
      expect(validateBody("PUT", path, JSON.stringify(body))?.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("refuses at the edge the topics the BASIC check can see (line breaks, control, invisible, too short or long) and accepts normal topics", () => {
    // instruction phrases and encodings are checked by the API only (strict schema in @quizforge/core)
    const bad: Record<string, string> = {
      newline: "Retries\nand dead jobs",
      "carriage return": "Retries\rand dead jobs",
      "line separator": "Retries\u2028and dead jobs",
      "control character": "Retries\u0007 and dead jobs",
      "zero-width space": "Re\u200Btries",
      "bidi override": "Retries \u202Eand dead jobs",
      "tag characters": "Retries\u{E0041}\u{E0042}",
      "too short": "x",
      "too long": "a".repeat(201),
    };
    for (const [id, topic] of Object.entries(bad)) {
      const r = validateBody("POST", ["v1", "quizzes"], JSON.stringify({ topic }));
      expect(r?.status, id).toBe(400);
    }
    for (const topic of ["Retries and dead jobs", "Configuração", "¿Cómo funciona?"]) {
      expect(validateBody("POST", ["v1", "quizzes"], JSON.stringify({ topic })), topic).toBeUndefined();
    }
  });

  it("a missing body is validated as an empty object (so required fields are still enforced for the answer route)", () => {
    expect(validateBody("POST", ["v1", "quizzes"], undefined)).toBeUndefined(); // every create-quiz field is optional
    const r = validateBody("PUT", ["v1", "attempts", uuid, "answers", uuid], undefined);
    expect(r?.status).toBe(400);
    expect(r?.body.error.details).toBeInstanceOf(Array);
  });
});
