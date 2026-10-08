import type { AttemptResult, QuizSummary } from "@/lib/api";

export function ResultView({ result, quiz }: { result: AttemptResult; quiz: QuizSummary }) {
  const score = result.finalScore ?? 0;
  const pct = result.percent ?? 0;
  return (
    <>
      <section className="card" aria-live="polite">
        <p className="muted" style={{ margin: 0 }}>Your weighted score</p>
        <div className="score" data-testid="final-score">{score.toFixed(2)}<span className="muted" style={{ fontSize: 24, fontWeight: 500 }}> / 4</span></div>
        <p style={{ fontSize: 20, margin: "8px 0" }} data-testid="final-percent">{pct.toFixed(1)}%</p>
        <p className="muted small">
          4 points for a fully correct answer. Multi-answer questions earn 4 × (correct picks − wrong picks) ÷ number of correct options, never below 0.
          The final score is the weighted average, with weights 1.0, 1.1, 1.21 … (each question counts 10% more than the previous).
        </p>
        <div className="row"><a className="btn" href="/app">Back to dashboard</a><a className="btn secondary" href={`/app/quiz/${quiz.id}`} onClick={() => location.reload()}>Retake</a></div>
      </section>
      {result.questions.map((q) => (
        <section className="card" key={q.id}>
          <div className="row spread small muted">
            <span>Question {q.position}</span>
            <span>weight ×{(q.weight ?? 1).toFixed(2)} · <strong style={{ color: "var(--text)" }}>{(q.score ?? 0).toFixed(2)} / 4</strong></span>
          </div>
          <h3 style={{ marginTop: 8 }}>{q.prompt}</h3>
          {q.options.map((o) => {
            const cls = o.isCorrect ? "correct" : o.selected ? "wrong" : "";
            return (
              <div key={o.id} className={`opt ${cls}`}>
                <span aria-hidden>{o.isCorrect ? "✔" : o.selected ? "✘" : "·"}</span>
                <span>
                  {o.text}
                  <span className="sr-only">{o.isCorrect ? " (correct answer)" : ""}{o.selected ? " (your answer)" : ""}</span>
                  {o.selected && <span className="badge" style={{ marginLeft: 8 }}>your answer</span>}
                </span>
              </div>
            );
          })}
          <p className="small"><strong>Why:</strong> {q.explanation}</p>
          <p className="small muted">From the document: “{q.sourceQuote}”</p>
        </section>
      ))}
    </>
  );
}
