import { describe, expect, it } from "vitest";
import { phaseLabel, progressFraction } from "./progress";

describe("phaseLabel", () => {
  it("names every phase in plain English", () => {
    expect(["reading_document", "planning", "writing_questions", "checking", "reviewing", "saving"].map((phase) => phaseLabel({ phase }))).toEqual([
      "Reading the document", "Planning the questions", "Writing questions", "Running quality checks", "Reviewing the questions", "Saving",
    ]);
  });
  it("adds the sub-progress in parentheses", () => {
    expect(phaseLabel({ phase: "writing_questions", detail: "section 2 of 5" })).toBe("Writing questions (section 2 of 5)");
    expect(phaseLabel({ phase: "reviewing", detail: "round 1 of 2" })).toBe("Reviewing the questions (round 1 of 2)");
  });
  it("a phase this client does not know (added later by the server) gets a generic label", () => {
    expect(phaseLabel({ phase: "something_new" })).toBe("Working on your quiz");
  });
});

describe("progressFraction", () => {
  it("is step over total, clamped to 0..1 (the total can be re-scaled by the server)", () => {
    expect(progressFraction({ step: 2, totalSteps: 5 })).toBeCloseTo(0.4);
    expect(progressFraction({ step: 6, totalSteps: 5 })).toBe(1);
    expect(progressFraction({ step: -1, totalSteps: 5 })).toBe(0);
  });
});
