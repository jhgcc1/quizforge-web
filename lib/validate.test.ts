import { BAD_TOPICS } from "@quizforge/core";
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

  it("refuses every bad topic of the attack corpus at the edge (hidden, encoded or instruction-like text) and accepts normal topics", () => {
    for (const b of BAD_TOPICS) {
      const r = validateBody("POST", ["v1", "quizzes"], JSON.stringify({ topic: b.topic }));
      expect(r?.status, b.id).toBe(400);
    }
    for (const topic of ["Retries and dead jobs", "Configuração", "¿Cómo funciona?"]) {
      expect(validateBody("POST", ["v1", "quizzes"], JSON.stringify({ topic })), topic).toBeUndefined();
    }
  });
});
