"use client";
import { useEffect, useState } from "react";
import { QuizListSchema } from "@quizforge/core/schemas";
import { api, type QuizSummary } from "@/lib/api";

const host = (u: string) => {
  try { return new URL(u).pathname.split("/").slice(1, 3).join("/"); } catch { return u; }
};

export function QuizList() {
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const { data } = await api("/v1/quizzes", { schema: QuizListSchema });
        if (!alive) return;
        setQuizzes(data.quizzes);
        setError(null);
        if (data.quizzes.some((q) => q.status === "queued" || q.status === "generating")) timer = setTimeout(load, 4000);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  return (
    <section className="card" aria-live="polite">
      <h2>History</h2>
      {error && <p className="alert error" role="alert">{error}</p>}
      {!quizzes && !error && <p className="muted"><span className="spinner" aria-hidden /> Loading…</p>}
      {quizzes && quizzes.length === 0 && <p className="muted">No quizzes yet. Create your first one above.</p>}
      {quizzes && quizzes.length > 0 && (
        <ul className="list">
          {quizzes.map((q) => (
            <li key={q.id} className="row spread">
              <div>
                <a href={`/app/quiz/${q.id}`}><strong>{host(q.sourceUrl)}</strong></a>{q.topic ? <span className="muted"> · {q.topic}</span> : null}
                <div className="muted small">{q.numQuestions} questions · {q.strategyUsed ?? q.strategyRequested} · {new Date(q.createdAt).toLocaleString()}</div>
              </div>
              <span className={`chip ${q.status}`}>{q.status}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
