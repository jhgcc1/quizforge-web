"use client";
import { useEffect, useState } from "react";
import { DocumentRequestListSchema, type DocumentRequest } from "@quizforge/contract";
import { ApiError, api } from "@/lib/api";

/**
 * What an administrator decides on: documents the prompt-injection classifier refused and somebody asked to have looked at.
 *
 * It shows the SCORE and the EXCERPT that triggered the refusal next to the link, because approving puts the document in
 * everyone's dropdown — the decision is about the document, not about the person asking. The API checks the group again:
 * this page only decides what to render.
 */
export function ReviewQueue() {
  const [items, setItems] = useState<DocumentRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    api("/v1/document-requests", { schema: DocumentRequestListSchema })
      .then((r) => setItems(r.data.items))
      .catch((e) => setError(e instanceof ApiError && e.status === 403 ? "This page is for administrators." : (e as Error).message));

  useEffect(() => {
    void load();
  }, []);

  const decide = async (id: string, action: "approve" | "reject") => {
    setBusy(id);
    setError(null);
    try {
      await api(`/v1/document-requests/${id}/review`, { method: "POST", body: { action } });
      setItems((list) => (list ?? []).filter((r) => r.id !== id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="alert error" role="alert">{error}</p>;
  if (!items) return <p className="muted">Loading…</p>;
  if (!items.length) return <p className="muted">Nothing is waiting for review.</p>;

  return (
    <ul className="list">
      {items.map((r) => (
        <li key={r.id} className="card">
          <h2>{r.title}</h2>
          <p className="small break">
            <a href={r.url} target="_blank" rel="noreferrer noopener">{r.url}</a>
          </p>
          {r.description ? <p>{r.description}</p> : null}
          {r.note ? <p className="muted small">Asked because: {r.note}</p> : null}
          <p className="alert info">
            The classifier scored <b>{r.detectorScore === null ? "?" : r.detectorScore.toFixed(2)}</b> for prompt injection.
            {r.excerpt ? <><br /><code className="small">{r.excerpt}</code></> : null}
          </p>
          <p className="muted small">
            Approving adds this document to the list everyone can pick from. Open the link and read it first.
          </p>
          <div className="row actions">
            <button type="button" className="btn primary" disabled={busy === r.id} onClick={() => decide(r.id, "approve")}>
              {busy === r.id ? "Working…" : "Approve and add to the list"}
            </button>
            <button type="button" className="btn secondary" disabled={busy === r.id} onClick={() => decide(r.id, "reject")}>
              Reject
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
