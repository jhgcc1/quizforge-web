"use client";
import { useEffect, useState } from "react";
import { DocumentRequestListSchema, DocumentRequestSchema, type DocumentRequest } from "@quizforge/contract";
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

  const decide = async (id: string, action: "approve" | "reject" | "revoke") => {
    setBusy(id);
    setError(null);
    try {
      const { data } = await api(`/v1/document-requests/${id}/review`, { method: "POST", body: { action }, schema: DocumentRequestSchema });
      // The row stays, with its new state: a decision is history, and an approval has to remain visible to be undone.
      setItems((list) => (list ?? []).map((r) => (r.id === id ? data : r)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="alert error" role="alert">{error}</p>;
  if (!items) return <p className="muted">Loading…</p>;

  const waiting = items.filter((r) => r.status === "pending");
  const decided = items.filter((r) => r.status !== "pending");
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "");

  const card = (r: DocumentRequest) => (
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
          {r.status === "pending" ? (
            <>
              <p className="muted small">
                Approving adds this document to the list everyone can pick from. It is still generated with every guard
                running and the output rails in their strict setting — you are saying it is not an attack, not vouching for
                it. Open the link and read it first.
              </p>
              <div className="row actions">
                <button type="button" className="btn primary" disabled={busy === r.id} onClick={() => decide(r.id, "approve")}>
                  {busy === r.id ? "Working…" : "Approve and add to the list"}
                </button>
                <button type="button" className="btn secondary" disabled={busy === r.id} onClick={() => decide(r.id, "reject")}>
                  Reject
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="muted small">
                <b>{LABEL[r.status]}</b>
                {r.reviewedAt ? ` on ${when(r.reviewedAt)}` : ""}
                {r.reviewedBy ? ` by ${r.reviewedBy}` : ""}.
              </p>
              {r.status === "approved" && (
                <div className="row actions">
                  <button type="button" className="btn secondary" disabled={busy === r.id} onClick={() => decide(r.id, "revoke")}>
                    {busy === r.id ? "Working…" : "Remove from the list"}
                  </button>
                  <span className="muted small">It goes back to being refused, for everyone, from the next quiz on.</span>
                </div>
              )}
            </>
          )}
        </li>
  );

  return (
    <>
      <h2>Waiting for a decision</h2>
      {waiting.length ? <ul className="list">{waiting.map(card)}</ul> : <p className="muted">Nothing is waiting for review.</p>}
      {decided.length > 0 && (
        <>
          <h2 style={{ marginTop: 32 }}>Already decided</h2>
          <p className="muted small">
            An approval stays in force until somebody takes it back, so it is listed here rather than disappearing.
          </p>
          <ul className="list">{decided.map(card)}</ul>
        </>
      )}
    </>
  );
}

const LABEL: Record<string, string> = {
  approved: "Approved and in the list",
  rejected: "Rejected",
  revoked: "Approved, then taken back out of the list",
};
