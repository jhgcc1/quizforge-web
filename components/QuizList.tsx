"use client";
import { useEffect, useState } from "react";
import { QuizListSchema } from "@quizforge/core/schemas";
import { api, type QuizListItem } from "@/lib/api";

const host = (u: string) => {
  try { return new URL(u).pathname.split("/").slice(1, 3).join("/"); } catch { return u; }
};

/** The user's result on a quiz: last score (best, when different), the open attempt, or nothing yet. */
function Progress({ q }: { q: QuizListItem }) {
  const { last, best, inProgressAttemptId, attempts } = q.progress;
  if (q.status !== "ready") return null;
  if (last) {
    return (
      <span className="small" title={`${attempts} attempt${attempts === 1 ? "" : "s"}`}>
        <strong>{last.finalScore.toFixed(2)} / 4</strong> <span className="muted">({Math.round(last.percent)}%{best !== null && best > last.finalScore ? ` · best ${best.toFixed(2)}` : ""})</span>
        {inProgressAttemptId ? <span className="muted"> · retake in progress</span> : null}
      </span>
    );
  }
  return <span className="muted small">{inProgressAttemptId ? "in progress" : "not answered yet"}</span>;
}

export function QuizList() {
  const [quizzes, setQuizzes] = useState<QuizListItem[] | null>(null);
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
              <div className="row">
                <Progress q={q} />
                <span className={`chip ${q.status}`}>{q.status}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
