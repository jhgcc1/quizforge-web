// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), api: vi.fn(), newKey: () => "key-1" }));
vi.mock("@/lib/client-log", () => ({ reportClientError: vi.fn() }));

import { ApiError, api } from "@/lib/api";
import { reportClientError } from "@/lib/client-log";
import ErrorPage from "@/app/error";
import { ClientErrorReporter } from "./ClientErrorReporter";
import { CreateQuizForm } from "./CreateQuizForm";
import { QuizList } from "./QuizList";
import { QuizRunner } from "./QuizRunner";
import { ResultView } from "./ResultView";
import { RequestReview } from "./RequestReview";
import { ReviewQueue } from "./ReviewQueue";
import { UserMenu } from "./UserMenu";

const apiMock = vi.mocked(api);
const ok = (data: unknown) => Promise.resolve({ data, replayed: false, status: 200 }) as ReturnType<typeof api>;
const route = (table: Record<string, () => unknown>) =>
  apiMock.mockImplementation(((path: string, opts?: { method?: string }) => {
    const key = `${opts?.method ?? "GET"} ${path}`;
    const hit = Object.entries(table).find(([k]) => key === k);
    if (!hit) return Promise.reject(new Error(`unexpected ${key}`));
    const v = hit[1]();
    return v instanceof Error ? Promise.reject(v) : ok(v);
  }) as typeof api);

beforeEach(() => { apiMock.mockReset(); push.mockReset(); });
afterEach(() => vi.useRealTimers());

const entry = (o: Record<string, unknown> = {}) => ({ id: "pipecat", title: "Pipecat", description: "Voice agents", kind: "readme", language: "en", size: "long", tests: "long documents", url: "https://github.com/pipecat-ai/pipecat/blob/main/README.md", ...o });

describe("CreateQuizForm", () => {
  it("lists the catalog, validates, and creates a quiz with one stable Idempotency-Key", async () => {
    route({ "GET /v1/catalog": () => ({ items: [entry(), entry({ id: "t1", title: "Tiny", kind: "test" })] }), "POST /v1/quizzes": () => ({ quiz: { id: "q-1" } }) });
    render(<CreateQuizForm />);
    await screen.findByText(/Voice agents/);
    fireEvent.change(screen.getByLabelText("Topic (optional)"), { target: { value: "agents" } });
    fireEvent.change(screen.getByLabelText("Questions"), { target: { value: "7" } });
    fireEvent.click(screen.getByLabelText(/second AI pass/));
    fireEvent.click(screen.getByRole("button", { name: "Generate quiz" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/quiz/q-1"));
    const call = apiMock.mock.calls.find(([p]) => p === "/v1/quizzes")![1]!;
    expect(call).toMatchObject({ method: "POST", idempotencyKey: "key-1", body: { topic: "agents", numQuestions: 7, critique: false, strategy: "auto" } });
  });
  it("falls back to a pasted URL when the catalog fails, and shows a message for an empty URL", async () => {
    route({ "GET /v1/catalog": () => new Error("down") });
    render(<CreateQuizForm />);
    await screen.findByText(/document list is unavailable/);
    const url = screen.getByLabelText("Markdown URL");
    fireEvent.change(url, { target: { value: "not a url" } });
    fireEvent.submit(url.closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toBeTruthy();
    expect(apiMock.mock.calls.some(([p]) => p === "/v1/quizzes")).toBe(false);
  });
  it("shows the API error and keeps the key, so pressing again is a safe retry", async () => {
    let n = 0;
    route({ "GET /v1/catalog": () => ({ items: [entry()] }), "POST /v1/quizzes": () => (++n === 1 ? new ApiError(429, "rate", "Daily limit reached") : { quiz: { id: "q-2" } }) });
    render(<CreateQuizForm />);
    await screen.findByText(/Voice agents/);
    const button = screen.getByRole("button", { name: "Generate quiz" });
    fireEvent.click(button);
    expect((await screen.findByRole("alert")).textContent).toBe("Daily limit reached");
    fireEvent.click(screen.getByRole("button", { name: "Generate quiz" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/quiz/q-2"));
    const keys = apiMock.mock.calls.filter(([p]) => p === "/v1/quizzes").map(([, o]) => (o as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toEqual(["key-1", "key-1"]);
  });
  it("shows a generic message for an unexpected error", async () => {
    route({ "GET /v1/catalog": () => ({ items: [entry()] }), "POST /v1/quizzes": () => new Error("boom") });
    render(<CreateQuizForm />);
    await screen.findByText(/Voice agents/);
    fireEvent.click(screen.getByRole("button", { name: "Generate quiz" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Something went wrong. Try again.");
  });
});

const item = (o: Record<string, unknown> = {}) => ({
  id: "q1", sourceUrl: "https://github.com/acme/app/blob/main/README.md", topic: "deploy", status: "ready", numQuestions: 6, strategyRequested: "auto", strategyUsed: "single-shot",
  createdAt: "2026-10-01T10:00:00Z", progress: { attempts: 0, last: null, best: null, inProgressAttemptId: null }, ...o,
});

describe("QuizList", () => {
  it("shows the empty state, an error, and each progress variant", async () => {
    route({ "GET /v1/quizzes": () => ({ quizzes: [] }) });
    const first = render(<QuizList />);
    await screen.findByText(/No quizzes yet/);
    first.unmount();

    route({ "GET /v1/quizzes": () => new Error("API down") });
    const second = render(<QuizList />);
    expect((await screen.findByRole("alert")).textContent).toBe("API down");
    second.unmount();

    route({
      "GET /v1/quizzes": () => ({
        quizzes: [
          item({ id: "a" }),
          item({ id: "b", progress: { attempts: 1, last: { finalScore: 3.2, percent: 80 }, best: 3.6, inProgressAttemptId: "x" } }),
          item({ id: "c", progress: { attempts: 2, last: { finalScore: 2, percent: 50 }, best: null, inProgressAttemptId: null }, topic: null, strategyUsed: null }),
          item({ id: "d", progress: { attempts: 0, last: null, best: null, inProgressAttemptId: "y" } }),
          item({ id: "e", status: "failed" }),
        ],
      }),
    });
    render(<QuizList />);
    await screen.findByText("not answered yet");
    expect(screen.getByText(/best 3\.60/)).toBeTruthy();
    expect(screen.getByText(/retake in progress/)).toBeTruthy();
    expect(screen.getByText("in progress")).toBeTruthy();
    expect(screen.getByText("3.20 / 4").closest("span")?.getAttribute("title")).toBe("1 attempt");
    expect(screen.getByText("2.00 / 4").closest("span")?.getAttribute("title")).toBe("2 attempts");
    expect(screen.getAllByText("acme/app")).toHaveLength(5);
  });
  it("polls while a quiz is still being generated", async () => {
    vi.useFakeTimers();
    let n = 0;
    route({ "GET /v1/quizzes": () => ({ quizzes: [item({ status: ++n < 2 ? "generating" : "ready" })] }) });
    render(<QuizList />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText("generating")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(screen.getByText("ready")).toBeTruthy();
    expect(n).toBe(2);
  });
});

const quizReady = { id: "qz", sourceUrl: "https://github.com/a/b/blob/main/README.md", topic: "agents", status: "ready", numQuestions: 2, strategyRequested: "auto", strategyUsed: "single-shot", error: null };
const questions = [
  { id: "q-a", position: 1, prompt: "First?", type: "single", options: [{ id: "a1", text: "Alpha" }, { id: "a2", text: "Beta" }] },
  { id: "q-b", position: 2, prompt: "Second?", type: "multiple", options: [{ id: "b1", text: "One" }, { id: "b2", text: "Two" }] },
];
const result = {
  id: "att", finalScore: 3.5, percent: 87.5,
  questions: [{ id: "q-a", position: 1, prompt: "First?", weight: 1, score: 4, explanation: "Because.", sourceQuote: "alpha is first", options: [{ id: "a1", text: "Alpha", isCorrect: true, selected: true }, { id: "a2", text: "Beta", isCorrect: false, selected: true }, { id: "a3", text: "Gamma", isCorrect: false, selected: false }] }],
};

describe("QuizRunner", () => {
  const base = (over: Record<string, () => unknown> = {}) => ({
    "GET /v1/quizzes/qz": () => ({ quiz: quizReady, questions }),
    "GET /v1/quizzes/qz/attempts": () => ({ attempts: [] }),
    "POST /v1/quizzes/qz/attempts": () => ({ attempt: { id: "att" }, answers: [] }),
    "PUT /v1/attempts/att/answers/q-a": () => ({ status: "saved" }),
    "PUT /v1/attempts/att/answers/q-b": () => ({ status: "saved" }),
    "POST /v1/attempts/att/submit": () => ({ result }),
    ...over,
  });

  it("walks through the quiz, saves each answer, and shows the result", async () => {
    route(base());
    render(<QuizRunner quizId="qz" />);
    fireEvent.click(await screen.findByRole("button", { name: "Start quiz" }));
    await screen.findByRole("heading", { name: "First?" });
    expect(screen.getByText("Select one answer.")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Alpha"));
    await screen.findByText("Saved ✓");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("heading", { name: "Second?" });
    expect(screen.getByText("Select all that apply.")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("One"));
    fireEvent.click(screen.getByLabelText("Two"));
    fireEvent.click(screen.getByLabelText("One")); // deselect
    await screen.findByText("Saved ✓");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByRole("heading", { name: "First?" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByTestId("final-score")).toBeTruthy();
    const puts = apiMock.mock.calls.filter(([p, o]) => (o as { method?: string } | undefined)?.method === "PUT" && String(p).endsWith("q-b"));
    expect(puts.map(([, o]) => (o as { body: { optionIds: string[]; revision: number } }).body)).toEqual([
      { optionIds: ["b1"], revision: 1 }, { optionIds: ["b1", "b2"], revision: 2 }, { optionIds: ["b2"], revision: 3 },
    ]);
  });
  it("does not allow clearing the last option of a multiple-choice question", async () => {
    route(base());
    render(<QuizRunner quizId="qz" />);
    fireEvent.click(await screen.findByRole("button", { name: "Start quiz" }));
    await screen.findByRole("heading", { name: "First?" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByLabelText("One"));
    await screen.findByText("Saved ✓");
    fireEvent.click(screen.getByLabelText("One"));
    expect(apiMock.mock.calls.filter(([p]) => String(p).endsWith("q-b"))).toHaveLength(1);
  });
  it("offers Retry when a save fails and blocks submit until it is saved", async () => {
    let fail = true;
    route(base({ "PUT /v1/attempts/att/answers/q-a": () => (fail ? new Error("save failed") : { status: "saved" }) }));
    render(<QuizRunner quizId="qz" />);
    fireEvent.click(await screen.findByRole("button", { name: "Start quiz" }));
    await screen.findByRole("heading", { name: "First?" });
    fireEvent.click(screen.getByLabelText("Alpha"));
    await screen.findByText(/Could not save/);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: /Submit/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Some answers could not be saved/);
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    fail = false;
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await screen.findByText("Saved ✓");
  });
  it("resumes an open attempt (Continue) at the first unanswered question", async () => {
    route(base({
      "GET /v1/quizzes/qz/attempts": () => ({ attempts: [{ id: "att", status: "in_progress" }] }),
      "POST /v1/quizzes/qz/attempts": () => ({ attempt: { id: "att" }, answers: [{ questionId: "q-a", optionIds: ["a1"], revision: 1 }] }),
    }));
    render(<QuizRunner quizId="qz" />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue quiz" }));
    await screen.findByRole("heading", { name: "Second?" });
  });
  it("shows earlier results, lets the user view one, and offers Retake", async () => {
    route(base({
      "GET /v1/quizzes/qz/attempts": () => ({ attempts: [{ id: "att", status: "submitted", finalScore: 2.5, percent: 62.5, submittedAt: "2026-10-01T10:00:00Z" }] }),
      "GET /v1/attempts/att": () => ({ result }),
    }));
    render(<QuizRunner quizId="qz" />);
    await screen.findByRole("button", { name: "Retake quiz" });
    fireEvent.click(screen.getByRole("button", { name: "View result" }));
    expect(await screen.findByTestId("final-score")).toBeTruthy();
  });
  it("shows a message when viewing a result or starting fails", async () => {
    route(base({
      "GET /v1/quizzes/qz/attempts": () => ({ attempts: [{ id: "att", status: "submitted", finalScore: 1, percent: 25, submittedAt: null }] }),
      "GET /v1/attempts/att": () => new Error("no result"),
      "POST /v1/quizzes/qz/attempts": () => new Error("cannot start"),
    }));
    render(<QuizRunner quizId="qz" />);
    fireEvent.click(await screen.findByRole("button", { name: "View result" }));
    expect((await screen.findByRole("alert")).textContent).toBe("no result");
    fireEvent.click(screen.getByRole("button", { name: "Retake quiz" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("cannot start"));
  });
  it("explains a missing quiz, a failed quiz and a quiz still being written", async () => {
    route({ "GET /v1/quizzes/qz": () => new ApiError(404, "not_found", "x") });
    const a = render(<QuizRunner quizId="qz" />);
    expect((await screen.findByRole("alert")).textContent).toBe("This quiz does not exist.");
    a.unmount();

    route({ "GET /v1/quizzes/qz": () => ({ quiz: { ...quizReady, status: "failed", error: "document too long" }, questions: [] }) });
    const b = render(<QuizRunner quizId="qz" />);
    expect((await screen.findByRole("alert")).textContent).toBe("document too long");
    b.unmount();

    vi.useFakeTimers();
    let n = 0;
    route({ "GET /v1/quizzes/qz": () => ({ quiz: { ...quizReady, status: ++n < 2 ? "generating" : "ready" }, questions }), "GET /v1/quizzes/qz/attempts": () => ({ attempts: [] }) });
    render(<QuizRunner quizId="qz" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText(/Writing your quiz/)).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByText(/Ready: 2 questions/)).toBeTruthy();
  });

  it("shows a progress bar with the phase while generating, re-scaling when the server changes totalSteps, and honest fallbacks without progress", async () => {
    vi.useFakeTimers();
    const steps = [
      { status: "queued" },
      { status: "generating", generationProgress: null },
      { status: "generating", generationProgress: { phase: "reading_document", step: 1, totalSteps: 5 } },
      { status: "generating", generationProgress: { phase: "writing_questions", step: 2, totalSteps: 5, detail: "section 2 of 5" } },
      { status: "generating", generationProgress: { phase: "reviewing", step: 4, totalSteps: 6, detail: "round 1 of 2" } },
      { status: "ready" },
    ];
    let n = 0;
    route({ "GET /v1/quizzes/qz": () => ({ quiz: { ...quizReady, ...steps[Math.min(n++, steps.length - 1)] }, questions }), "GET /v1/quizzes/qz/attempts": () => ({ attempts: [] }) });
    render(<QuizRunner quizId="qz" />);
    // advance until exactly one more poll happened (the poll delay backs off from 1.5 s to 5 s)
    const next = async () => { const before = n; while (n === before) await act(async () => { await vi.advanceTimersByTimeAsync(100); }); };
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    // queued: no phase yet, no bar, the spinner and an honest message
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("Waiting for a free worker…")).toBeTruthy();
    await next(); // generating but nothing reported yet (or an older API without the field)
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("The agent is getting started…")).toBeTruthy();

    await next();
    let bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("1");
    expect(bar.getAttribute("aria-valuemax")).toBe("5");
    expect(screen.getByTestId("phase-label").textContent).toContain("Reading the document");

    await next();
    bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuetext")).toBe("Writing questions (section 2 of 5)");
    expect(screen.getByTestId("phase-label").textContent).toContain("Writing questions (section 2 of 5)");
    expect((bar.firstChild as HTMLElement).style.width).toBe("40%");

    await next(); // a review step appeared: the total grows, the bar re-scales, the step still went up
    bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("4");
    expect(bar.getAttribute("aria-valuemax")).toBe("6");
    expect(screen.getByTestId("phase-label").textContent).toContain("Reviewing the questions (round 1 of 2)");

    await next();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText(/Ready: 2 questions/)).toBeTruthy();
  });
});

describe("ResultView", () => {
  it("shows the score, the correct and the chosen options, and the explanation", () => {
    render(<ResultView result={result as never} quiz={quizReady as never} />);
    expect(screen.getByTestId("final-score").textContent).toContain("3.50");
    expect(screen.getByTestId("final-percent").textContent).toBe("87.5%");
    expect(screen.getByText("(correct answer)", { exact: false })).toBeTruthy();
    expect(screen.getAllByText("your answer").length).toBeGreaterThan(0);
    expect(screen.getByText(/Because\./)).toBeTruthy();
    expect(screen.getByText(/alpha is first/)).toBeTruthy();
  });
});

describe("UserMenu", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("shows a shortened account id, or nothing when signed out or offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ sub: "0123456789abcdef" }), { status: 200 })));
    const a = render(<UserMenu />);
    await screen.findByText("01234567…");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    a.unmount();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    const b = render(<UserMenu />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByTitle("Your account id")).toBeNull();
    b.unmount();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<UserMenu />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });
  const me = (o: unknown) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(o), { status: 200 })));
  it("shows the name, with name and e-mail in the tooltip", async () => {
    me({ sub: "0123456789abcdef", name: "Ana Souza", email: "ana@example.com", label: "Ana Souza" });
    render(<UserMenu />);
    const el = await screen.findByText("Ana Souza");
    expect(el.getAttribute("title")).toBe("Signed in as Ana Souza · ana@example.com");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });
  it("falls back to the e-mail, then to the short id", async () => {
    me({ sub: "0123456789abcdef", email: "ana@example.com", label: "ana@example.com" });
    const a = render(<UserMenu />);
    expect((await screen.findByText("ana@example.com")).getAttribute("title")).toBe("Signed in as ana@example.com");
    a.unmount();
    me({ sub: "0123456789abcdef", label: "01234567…" });
    render(<UserMenu />);
    expect((await screen.findByText("01234567…")).getAttribute("title")).toBe("Signed in (account id)");
  });
  it("works with a name only equal to the e-mail, and with an older {sub} answer", async () => {
    me({ sub: "u1", name: "a@b.co", email: "a@b.co", label: "a@b.co" });
    const a = render(<UserMenu />);
    expect((await screen.findByText("a@b.co")).getAttribute("title")).toBe("Signed in as a@b.co");
    a.unmount();
    me({ sub: "0123456789abcdef" });
    render(<UserMenu />);
    await screen.findByText("01234567…");
  });
  it("truncates a very long value with CSS ellipsis and keeps the whole text accessible", async () => {
    const long = "a-very-long-person-name-".repeat(6);
    me({ sub: "u1", name: long, label: long });
    render(<UserMenu />);
    const el = await screen.findByText(long);
    expect(el.style.textOverflow).toBe("ellipsis");
    expect(el.style.overflow).toBe("hidden");
    expect(el.style.whiteSpace).toBe("nowrap");
    expect(el.style.maxWidth).toContain("40vw");
  });
  it("keeps a short id whole", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ sub: "u1" }), { status: 200 })));
    render(<UserMenu />);
    await screen.findByText("u1");
  });
});

describe("error handling in the browser", () => {
  it("the error page reports the error and lets the user retry", () => {
    const reset = vi.fn();
    const error = Object.assign(new Error("render failed"), { digest: "d-1" });
    render(<ErrorPage error={error} reset={reset} />);
    expect(reportClientError).toHaveBeenCalledWith(error, "react", "d-1");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Back to dashboard" }).getAttribute("href")).toBe("/app");
  });
  it("the reporter forwards window errors and unhandled rejections, and stops after unmount", () => {
    vi.mocked(reportClientError).mockClear();
    const view = render(<ClientErrorReporter />);
    const boom = new Error("uncaught");
    window.dispatchEvent(new ErrorEvent("error", { error: boom, message: "uncaught" }));
    window.dispatchEvent(new ErrorEvent("error", { message: "script error" })); // no error object: the message is used
    const rejection = new Event("unhandledrejection") as Event & { reason: unknown };
    rejection.reason = "nope";
    window.dispatchEvent(rejection);
    expect(reportClientError).toHaveBeenNthCalledWith(1, boom, "window");
    expect(reportClientError).toHaveBeenNthCalledWith(2, "script error", "window");
    expect(reportClientError).toHaveBeenNthCalledWith(3, "nope", "promise");
    view.unmount();
    window.dispatchEvent(new ErrorEvent("error", { message: "after" }));
    expect(reportClientError).toHaveBeenCalledTimes(3);
  });
});

describe("the document review flow", () => {
  const refused = {
    id: "qz", sourceUrl: "https://raw.githubusercontent.com/elastic/elasticsearch/main/README.asciidoc", topic: null, status: "failed",
    numQuestions: 6, strategyRequested: "auto", strategyUsed: null, critique: true, createdAt: "2026-10-16T00:00:00.000Z",
    error: "Our prompt-injection classifier rejected this document. If it is a legitimate README, you can ask for it to be reviewed and added to the document list.",
    reviewable: true,
  };

  it("offers the review only when the API says the quiz is reviewable", async () => {
    route({ "GET /v1/quizzes/qz": () => ({ quiz: refused, questions: [] }), "GET /v1/quizzes/qz/attempts": () => ({ attempts: [] }) });
    render(<QuizRunner quizId="qz" />);
    expect(await screen.findByRole("button", { name: /ask for this document to be reviewed/i })).toBeTruthy();

    cleanup(); // the first render stays in the document otherwise, and the query below would find its button
    apiMock.mockReset();
    route({ "GET /v1/quizzes/qz": () => ({ quiz: { ...refused, reviewable: false, error: "The AI could not produce a reliable quiz" }, questions: [] }), "GET /v1/quizzes/qz/attempts": () => ({ attempts: [] }) });
    const { container } = render(<QuizRunner quizId="qz" />);
    await waitFor(() => expect(container.textContent).toContain("could not produce"));
    expect(screen.queryByRole("button", { name: /ask for this document/i })).toBeNull();
  });

  it("sends the request with the quiz id, and says so when somebody already asked", async () => {
    const quizId = "11111111-2222-4333-8444-555555555555"; // the client validates the contract before sending
    apiMock.mockReset();
    apiMock.mockResolvedValue({ data: { id: "req-1" }, replayed: false, status: 201 } as never);
    render(<RequestReview quizId={quizId} sourceUrl="https://example.invalid/readme.md" />);
    fireEvent.click(screen.getByRole("button", { name: /ask for this document/i }));
    fireEvent.change(screen.getByLabelText(/name for the document/i), { target: { value: "Elasticsearch" } });
    fireEvent.click(screen.getByRole("button", { name: /send request/i }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/an administrator will look/i));
    expect(apiMock.mock.calls[0]![1]!.body).toMatchObject({ quizId, title: "Elasticsearch" });

    cleanup();
    apiMock.mockReset();
    apiMock.mockRejectedValue(new ApiError(409, "request_already_open", "already"));
    render(<RequestReview quizId="99999999-2222-4333-8444-555555555555" sourceUrl="https://example.invalid/x.md" />);
    fireEvent.click(screen.getByRole("button", { name: /ask for this document/i }));
    fireEvent.change(screen.getByLabelText(/name for the document/i), { target: { value: "Again" } });
    fireEvent.click(screen.getByRole("button", { name: /send request/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/already asked/i));
  });

  it("sends the note when the user writes one, and closing the form sends nothing", async () => {
    const quizId = "22222222-2222-4333-8444-555555555555";
    apiMock.mockReset();
    apiMock.mockResolvedValue({ data: { id: "req-3" }, replayed: false, status: 201 } as never);
    render(<RequestReview quizId={quizId} sourceUrl="https://example.invalid/readme.md" />);
    fireEvent.click(screen.getByRole("button", { name: /ask for this document/i }));
    fireEvent.change(screen.getByLabelText(/name for the document/i), { target: { value: "Pure Bash Bible" } });
    fireEvent.change(screen.getByLabelText(/why do you think it is safe/i), { target: { value: "A well-known shell cookbook" } });
    fireEvent.click(screen.getByRole("button", { name: /send request/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(apiMock.mock.calls[0]![1]!.body).toMatchObject({ note: "A well-known shell cookbook" });

    cleanup();
    apiMock.mockReset();
    render(<RequestReview quizId={quizId} sourceUrl="https://example.invalid/readme.md" />);
    fireEvent.click(screen.getByRole("button", { name: /ask for this document/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.getByRole("button", { name: /ask for this document/i })).toBeTruthy(); // back to the offer
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("refuses to send a request without a usable title", async () => {
    apiMock.mockReset();
    render(<RequestReview quizId="11111111-2222-4333-8444-555555555555" sourceUrl="https://example.invalid/readme.md" />);
    fireEvent.click(screen.getByRole("button", { name: /ask for this document/i }));
    fireEvent.click(screen.getByRole("button", { name: /send request/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/at least two characters/i));
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("shows the reviewer the score and the excerpt, and removes a decided request from the queue", async () => {
    const item = { id: "req-1", url: "https://raw.githubusercontent.com/elastic/elasticsearch/main/README.asciidoc", title: "Elasticsearch", description: null, note: "Real project", status: "pending", detectorScore: 0.97, excerpt: "the classifier scored 0.97 for prompt injection", createdAt: "2026-10-16T00:00:00.000Z", reviewedAt: null, reviewNote: null };
    apiMock.mockReset();
    route({ "GET /v1/document-requests": () => ({ items: [item] }), "POST /v1/document-requests/req-1/review": () => ({ ...item, status: "approved" }) });
    const { container } = render(<ReviewQueue />);
    await screen.findByText("Elasticsearch");
    expect(container.textContent).toContain("0.97");
    expect(container.textContent).toContain("the classifier scored");
    expect(container.textContent).toMatch(/adds this document to the list everyone/i);

    fireEvent.click(screen.getByRole("button", { name: /approve and add/i }));
    await waitFor(() => expect(screen.queryByText("Elasticsearch")).toBeNull());
  });

  it("keeps the request on screen and says what happened when the decision fails", async () => {
    const item = { id: "req-2", url: "https://raw.githubusercontent.com/o/r/HEAD/README.md", title: "Something", description: null, note: null, status: "pending", detectorScore: 0.95, excerpt: "the classifier scored 0.95", createdAt: "2026-10-16T00:00:00.000Z", reviewedAt: null, reviewNote: null };
    apiMock.mockReset();
    route({ "GET /v1/document-requests": () => ({ items: [item] }), "POST /v1/document-requests/req-2/review": () => new Error("the database is away") });
    render(<ReviewQueue />);
    await screen.findByText("Something");
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/database is away/i));
  });

  it("says when nothing is waiting, instead of showing an empty page", async () => {
    apiMock.mockReset();
    route({ "GET /v1/document-requests": () => ({ items: [] }) });
    render(<ReviewQueue />);
    await waitFor(() => expect(screen.getByText(/nothing is waiting/i)).toBeTruthy());
  });

  it("tells a non-admin that the queue is not for them", async () => {
    apiMock.mockReset();
    apiMock.mockRejectedValue(new ApiError(403, "forbidden", "nope"));
    render(<ReviewQueue />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/for administrators/i));
  });

  it("shows the review link in the menu only for an administrator", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sub: "u", label: "Ada", admin: true }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<UserMenu />);
    expect(await screen.findByRole("link", { name: /review queue/i })).toBeTruthy();

    cleanup();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ sub: "u", label: "Ada", admin: false }) });
    const { container } = render(<UserMenu />);
    await waitFor(() => expect(container.textContent).toContain("Ada"));
    expect(container.querySelector('a[href="/app/review"]')).toBeNull();
    vi.unstubAllGlobals();
  });
});
