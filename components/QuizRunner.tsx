"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, newKey, type AttemptResult, type PublicQuestion, type QuizSummary, type SavedAnswer } from "@/lib/api";
import { ResultView } from "./ResultView";

type Save = "idle" | "saving" | "saved" | "error";
interface Local { optionIds: string[]; revision: number; save: Save }

export function QuizRunner({ quizId }: { quizId: string }) {
  const [quiz, setQuiz] = useState<QuizSummary | null>(null);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, Local>>({});
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const pending = useRef(new Set<Promise<unknown>>());
  const startKey = useRef(newKey());

  /* poll until the quiz is ready or failed, backing off from 1.5s to 5s */
  useEffect(() => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let n = 0;
    const tick = async () => {
      try {
        const { data } = await api<{ quiz: QuizSummary; questions: PublicQuestion[] }>(`/v1/quizzes/${quizId}`, { signal: ctrl.signal });
        setQuiz(data.quiz);
        setQuestions(data.questions);
        if (data.quiz.status === "queued" || data.quiz.status === "generating") timer = setTimeout(tick, Math.min(5000, 1500 * 1.3 ** n++));
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setLoadError(e instanceof ApiError && e.status === 404 ? "This quiz does not exist." : (e as Error).message);
      }
    };
    void tick();
    return () => { ctrl.abort(); clearTimeout(timer); };
  }, [quizId]);

  const start = useCallback(async () => {
    setBusy(true);
    setActionError(null);
    try {
      // The server returns the in-progress attempt if there is one, so reloading never loses answers.
      const { data } = await api<{ attempt: { id: string }; answers: SavedAnswer[] }>(`/v1/quizzes/${quizId}/attempts`, { method: "POST", body: {}, idempotencyKey: startKey.current });
      setAttemptId(data.attempt.id);
      setAnswers(Object.fromEntries(data.answers.map((a) => [a.questionId, { optionIds: a.optionIds, revision: a.revision, save: "saved" as Save }])));
      const firstOpen = questions.findIndex((q) => !data.answers.some((a) => a.questionId === q.id));
      setIndex(firstOpen === -1 ? 0 : firstOpen);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [quizId, questions]);

  const persist = useCallback(
    (qid: string, optionIds: string[], revision: number) => {
      if (!attemptId) return;
      setAnswers((a) => ({ ...a, [qid]: { optionIds, revision, save: "saving" } }));
      const p = api(`/v1/attempts/${attemptId}/answers/${qid}`, { method: "PUT", body: { optionIds, revision } })
        .then(() => setAnswers((a) => (a[qid]?.revision === revision ? { ...a, [qid]: { optionIds, revision, save: "saved" } } : a)))
        .catch(() => setAnswers((a) => (a[qid]?.revision === revision ? { ...a, [qid]: { optionIds, revision, save: "error" } } : a)))
        .finally(() => pending.current.delete(p));
      pending.current.add(p);
    },
    [attemptId],
  );

  const choose = (q: PublicQuestion, optionId: string) => {
    const cur = answers[q.id];
    const next = q.type === "single" ? [optionId] : cur?.optionIds.includes(optionId) ? cur.optionIds.filter((x) => x !== optionId) : [...(cur?.optionIds ?? []), optionId];
    if (next.length === 0) return; // the API requires at least one option
    persist(q.id, next, (cur?.revision ?? 0) + 1);
  };

  const submit = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await Promise.allSettled([...pending.current]);
      const failed = Object.entries(answers).filter(([, a]) => a.save === "error");
      if (failed.length) throw new Error("Some answers could not be saved. Use “Retry” on the highlighted questions, then submit again.");
      const { data } = await api<{ result: AttemptResult }>(`/v1/attempts/${attemptId}/submit`, { method: "POST", body: {}, idempotencyKey: `submit-${attemptId}` });
      setResult(data.result);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /* ---------- render ---------- */
  if (loadError) return <p className="alert error" role="alert">{loadError}</p>;
  if (!quiz) return <p className="muted"><span className="spinner" aria-hidden /> Loading…</p>;
  if (result && quiz) return <ResultView result={result} quiz={quiz} />;

  if (quiz.status === "queued" || quiz.status === "generating") {
    return (
      <section className="card" aria-live="polite">
        <h1><span className="spinner" aria-hidden /> Writing your quiz…</h1>
        <p className="muted">The agent is reading the document and drafting questions. This usually takes 30–90 seconds. You can leave this page and come back from the dashboard.</p>
        <span className={`chip ${quiz.status}`}>{quiz.status}</span>
      </section>
    );
  }
  if (quiz.status === "failed") {
    return (
      <section className="card">
        <h1>We couldn’t generate this quiz</h1>
        <p className="alert error" role="alert">{quiz.error ?? "Unknown error"}</p>
        <a className="btn" href="/app">Back to dashboard</a>
      </section>
    );
  }

  if (!attemptId) {
    return (
      <section className="card">
        <h1>Ready: {quiz.numQuestions} questions</h1>
        <p className="muted">Strategy: {quiz.strategyUsed ?? quiz.strategyRequested}{quiz.topic ? ` · Topic: ${quiz.topic}` : ""}</p>
        <ul className="small muted">
          <li>Each answer is saved the moment you pick it, so you can reload without losing progress.</li>
          <li>Some questions have more than one correct option — you will be told when they do.</li>
          <li>Later questions weigh more: weights grow by 10% per question.</li>
        </ul>
        {actionError && <p className="alert error" role="alert">{actionError}</p>}
        <button className="btn" onClick={start} disabled={busy}>{busy ? "Starting…" : "Start quiz"}</button>
      </section>
    );
  }

  const q = questions[index]!;
  const cur = answers[q.id];
  const answered = questions.filter((x) => (answers[x.id]?.optionIds.length ?? 0) > 0).length;
  const last = index === questions.length - 1;
  return (
    <section className="card" aria-labelledby="qtitle">
      <div className="row spread small muted">
        <span>Question {index + 1} of {questions.length}</span>
        <span>{answered}/{questions.length} answered · weight ×{(1.1 ** index).toFixed(2)}</span>
      </div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={answered}><div style={{ width: `${(answered / questions.length) * 100}%` }} /></div>
      <h2 id="qtitle" style={{ marginTop: 20 }}>{q.prompt}</h2>
      <p className="small muted">{q.type === "multiple" ? "Select all that apply." : "Select one answer."}</p>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="sr-only">{q.prompt}</legend>
        {q.options.map((o) => {
          const on = cur?.optionIds.includes(o.id) ?? false;
          return (
            <label key={o.id} className={`opt${on ? " selected" : ""}`}>
              <input type={q.type === "single" ? "radio" : "checkbox"} name={`q-${q.id}`} checked={on} onChange={() => choose(q, o.id)} />
              <span style={{ fontWeight: 400, fontSize: 16 }}>{o.text}</span>
            </label>
          );
        })}
      </fieldset>
      <p className="small" aria-live="polite" style={{ minHeight: 22 }}>
        {cur?.save === "saving" && <span className="muted">Saving…</span>}
        {cur?.save === "saved" && <span style={{ color: "var(--ok)" }}>Saved ✓</span>}
        {cur?.save === "error" && <span style={{ color: "var(--bad)" }}>Could not save. <button className="btn secondary" style={{ padding: "2px 10px" }} onClick={() => persist(q.id, cur.optionIds, cur.revision)}>Retry</button></span>}
      </p>
      {actionError && <p className="alert error" role="alert">{actionError}</p>}
      <div className="row spread">
        <button className="btn secondary" onClick={() => setIndex((i) => i - 1)} disabled={index === 0}>Previous</button>
        {last ? (
          <button className="btn" onClick={submit} disabled={busy}>{busy ? "Scoring…" : answered < questions.length ? `Submit (${questions.length - answered} unanswered)` : "Submit"}</button>
        ) : (
          <button className="btn" onClick={() => setIndex((i) => i + 1)}>Next</button>
        )}
      </div>
    </section>
  );
}
