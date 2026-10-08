"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CatalogResponseSchema, CreateQuizBodySchema, QuizEnvelopeSchema } from "@quizforge/core/schemas";
import { ApiError, api, newKey, type CatalogEntry } from "@/lib/api";

const CUSTOM = "__custom__";
const LANGUAGE = { en: "English", pt: "Portuguese", es: "Spanish" } as const;
const SIZE = { short: "short", medium: "medium", long: "long" } as const;

export function CreateQuizForm() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [selected, setSelected] = useState<string>("");
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

  useEffect(() => {
    let alive = true;
    api("/v1/catalog", { schema: CatalogResponseSchema })
      .then(({ data }) => {
        if (!alive) return;
        setCatalog(data.items);
        setSelected((cur) => cur || data.items[0]?.id || CUSTOM);
      })
      .catch(() => {
        if (!alive) return;
        setCatalogError(true); // the list is a convenience: without it the user can still paste a URL
        setSelected(CUSTOM);
      });
    return () => { alive = false; };
  }, []);

  const entry = useMemo(() => catalog?.find((e) => e.id === selected), [catalog, selected]);
  const groups = useMemo(
    () => [
      { label: "Real project READMEs", items: (catalog ?? []).filter((e) => e.kind === "readme") },
      { label: "Test documents (each checks one behaviour)", items: (catalog ?? []).filter((e) => e.kind === "test") },
    ],
    [catalog],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const sourceUrl = selected === CUSTOM ? custom.trim() : entry?.url;
    if (!sourceUrl) return setError("Choose a document, or enter the URL of a Markdown file.");
    // The same schema the API enforces, so mistakes are explained here instead of after a round trip.
    const checked = CreateQuizBodySchema.safeParse({ sourceUrl, ...(topic.trim() ? { topic: topic.trim() } : {}), numQuestions: num, strategy, critique });
    if (!checked.success) return setError(checked.error.issues[0]?.message ?? "Check the form and try again.");
    const body = checked.data;
    const fp = JSON.stringify(body);
    if (!keyRef.current || keyRef.current.fingerprint !== fp) keyRef.current = { fingerprint: fp, key: newKey() };
    setBusy(true);
    try {
      const { data } = await api("/v1/quizzes", { method: "POST", body, idempotencyKey: keyRef.current.key, schema: QuizEnvelopeSchema });
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
          <select id="preset" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={!catalog && !catalogError}>
            {!catalog && !catalogError && <option value="">Loading documents…</option>}
            {groups.map((g) => g.items.length > 0 && (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((it) => <option key={it.id} value={it.id}>{it.title}</option>)}
              </optgroup>
            ))}
            <option value={CUSTOM}>Other: paste a URL…</option>
          </select>
          {entry && (
            <p className="muted" id="doc-info" style={{ margin: "6px 0 0", fontSize: 13 }}>
              {entry.description}. {LANGUAGE[entry.language]}, {SIZE[entry.size]}. <strong>Tests:</strong> {entry.tests}.
            </p>
          )}
          {catalogError && <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>The document list is unavailable; paste a URL instead.</p>}
        </div>
        {selected === CUSTOM && (
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
      <button className="btn" type="submit" disabled={busy || !ready || !selected}>{busy ? <><span className="spinner" aria-hidden /> Creating…</> : "Generate quiz"}</button>
    </form>
  );
}
