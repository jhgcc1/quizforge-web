"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api, newKey, type QuizSummary } from "@/lib/api";

const PRESETS = [
  { label: "Pipecat README", url: "https://github.com/pipecat-ai/pipecat/blob/main/README.md" },
  { label: "Mastra README", url: "https://github.com/mastra-ai/mastra/blob/main/README.md" },
  { label: "Custom URL…", url: "" },
];

export function CreateQuizForm() {
  const router = useRouter();
  const [preset, setPreset] = useState(PRESETS[0]!.url);
  const [custom, setCustom] = useState("");
  const [topic, setTopic] = useState("");
  const [num, setNum] = useState(6);
  const [strategy, setStrategy] = useState("auto");
  const [critique, setCritique] = useState(true);
  const [busy, setBusy] = useState(false);
  // Until React has hydrated, edits to the form would be reset and a click would do a native submit.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [error, setError] = useState<string | null>(null);
  // One Idempotency-Key per user intent: it only changes when the request itself changes.
  const keyRef = useRef<{ fingerprint: string; key: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const sourceUrl = preset || custom.trim();
    if (!sourceUrl) return setError("Enter the URL of a Markdown document.");
    const body = { sourceUrl, ...(topic.trim() ? { topic: topic.trim() } : {}), numQuestions: num, strategy, critique };
    const fp = JSON.stringify(body);
    if (!keyRef.current || keyRef.current.fingerprint !== fp) keyRef.current = { fingerprint: fp, key: newKey() };
    setBusy(true);
    try {
      const { data } = await api<{ quiz: QuizSummary }>("/v1/quizzes", { method: "POST", body, idempotencyKey: keyRef.current.key });
      keyRef.current = null;
      router.push(`/app/quiz/${data.quiz.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      setBusy(false); // the key is kept: pressing the button again is a safe retry
    }
  }

  return (
    <form className="card" onSubmit={submit} aria-busy={busy}>
      <h2>Create a quiz</h2>
      <div className="grid">
        <div>
          <label htmlFor="preset">Document</label>
          <select id="preset" value={preset} onChange={(e) => setPreset(e.target.value)}>
            {PRESETS.map((p) => <option key={p.label} value={p.url}>{p.label}</option>)}
          </select>
        </div>
        {preset === "" && (
          <div>
            <label htmlFor="url">Markdown URL</label>
            <input id="url" type="url" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="https://github.com/owner/repo/blob/main/README.md" required />
          </div>
        )}
        <div>
          <label htmlFor="topic">Topic (optional)</label>
          <input id="topic" type="text" value={topic} maxLength={200} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. deployment, agents" />
        </div>
        <div>
          <label htmlFor="num">Questions</label>
          <select id="num" value={num} onChange={(e) => setNum(Number(e.target.value))}>
            {[5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="strategy">Strategy</label>
          <select id="strategy" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            <option value="auto">Auto (pick from the document)</option>
            <option value="single-shot">Single shot (short docs)</option>
            <option value="section-map-reduce">By section (long docs)</option>
          </select>
        </div>
      </div>
      <p className="row">
        <label className="row" style={{ margin: 0, fontWeight: 500 }}>
          <input type="checkbox" checked={critique} onChange={(e) => setCritique(e.target.checked)} /> Review questions with a second AI pass (slower, higher quality)
        </label>
      </p>
      {error && <p className="alert error" role="alert">{error}</p>}
      <button className="btn" type="submit" disabled={busy || !ready}>{busy ? <><span className="spinner" aria-hidden /> Creating…</> : "Generate quiz"}</button>
    </form>
  );
}
