import type { GenerationProgress } from "@quizforge/contract";

const LABELS: Record<string, string> = {
  reading_document: "Reading the document",
  planning: "Planning the questions",
  writing_questions: "Writing questions",
  checking: "Running quality checks",
  reviewing: "Reviewing the questions",
  saving: "Saving",
};

/** Plain-English label of the phase, with the sub-progress when the server sent one: "Writing questions (section 2 of 5)". An unknown (newer) phase still gets a sensible label. */
export function phaseLabel(p: Pick<GenerationProgress, "phase" | "detail">): string {
  const base = LABELS[p.phase] ?? "Working on your quiz";
  return p.detail ? `${base} (${p.detail})` : base;
}

/** Fraction (0..1) for the bar. The server's totalSteps can change while the job runs, so this is always taken from the latest response and clamped. */
export function progressFraction(p: Pick<GenerationProgress, "step" | "totalSteps">): number {
  return Math.min(1, Math.max(0, p.step / p.totalSteps));
}
