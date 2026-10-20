"use client";
import { useEffect, useMemo, useState } from "react";
import { DocumentRequestListSchema, DocumentRequestSchema, type DocumentRequest } from "@quizforge/contract";
import { ApiError, api } from "@/lib/api";

/**
 * What an administrator decides on: documents the prompt-injection classifier refused and somebody asked to have looked at.
 *
 * A table rather than cards, because this list only grows and the job is to scan it: one row per request, the score where
 * the eye lands, and the decision one click away. The evidence — the text the classifier reacted to — is behind a toggle
 * instead of in every row, so twenty requests still fit on a screen while the one being judged can be opened.
 *
 * The API checks the admin group again; this page only decides what to render.
 */
const FILTERS = [
  { key: "waiting", label: "Waiting", match: (r: DocumentRequest) => r.status === "pending" },
  { key: "listed", label: "Approved", match: (r: DocumentRequest) => r.status === "approved" },
  { key: "refused", label: "Refused", match: (r: DocumentRequest) => r.status === "rejected" || r.status === "revoked" },
  { key: "all", label: "All", match: () => true },
] as const;

export function ReviewQueue() {
  const [items, setItems] = useState<DocumentRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("waiting");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  // A row just decided stays on screen even when the filter no longer matches it: approving something and watching it
  // vanish gives no confirmation and no way back, which is the whole reason decided requests are kept at all.
  const [justDecided, setJustDecided] = useState<string[]>([]);

  useEffect(() => {
    void api("/v1/document-requests", { schema: DocumentRequestListSchema })
      .then((r) => setItems(r.data.items))
      .catch((e) => setError(e instanceof ApiError && e.status === 403 ? "This page is for administrators." : (e as Error).message));
  }, []);

  const decide = async (id: string, action: "approve" | "reject" | "revoke") => {
    setBusy(id);
    setError(null);
    try {
      const { data } = await api(`/v1/document-requests/${id}/review`, { method: "POST", body: { action }, schema: DocumentRequestSchema });
      // The row stays, with its new state: a decision is history, and an approval has to remain visible to be undone.
      setItems((list) => (list ?? []).map((r) => (r.id === id ? data : r)));
      setJustDecided((ids) => (ids.includes(id) ? ids : [...ids, id]));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const counts = useMemo(() => {
    const all = items ?? [];
    return Object.fromEntries(FILTERS.map((f) => [f.key, all.filter(f.match).length])) as Record<string, number>;
  }, [items]);

  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!;
    const q = query.trim().toLowerCase();
    return (items ?? [])
      .filter((r) => f.match(r) || justDecided.includes(r.id))
      .filter((r) => !q || `${r.title} ${r.url} ${r.note ?? ""}`.toLowerCase().includes(q));
  }, [items, filter, query, justDecided]);

  if (error) return <p className="alert error" role="alert">{error}</p>;
  if (!items) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="row toolbar">
        <div className="segmented" role="group" aria-label="Filter by state">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label} <span className="n">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <input
          type="text"
          className="filter"
          value={query}
          placeholder="Filter by name, URL or reason"
          aria-label="Filter requests"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {rows.length === 0 ? (
        <p className="muted empty">
          {items.length === 0
            ? "Nothing here yet. A request arrives when the classifier refuses a document and the person who hit it asks for a second look — it is wrong often enough on real READMEs that a human should decide."
            : "No request matches this filter."}
        </p>
      ) : (
        <div className="tablewrap">
          <table className="requests">
            <thead>
              <tr>
                <th scope="col">Document</th>
                <th scope="col" className="num">Score</th>
                <th scope="col">State</th>
                <th scope="col">Decided</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const working = busy === r.id;
                const isOpen = open === r.id;
                return (
                  <Row key={r.id}>
                    <tr className={[isOpen ? "open" : "", justDecided.includes(r.id) ? "just-decided" : ""].filter(Boolean).join(" ") || undefined}>
                      <td>
                        <button type="button" className="disclose" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.id)}>
                          <span aria-hidden>{isOpen ? "▾" : "▸"}</span> {r.title}
                        </button>
                        <span className="muted small host">{host(r.url)}</span>
                      </td>
                      <td className="num"><b className="score-cell">{r.detectorScore === null ? "?" : r.detectorScore.toFixed(2)}</b></td>
                      <td><span className={`chip ${r.status}`}>{LABEL[r.status]}</span></td>
                      <td className="muted small">{r.reviewedAt ? `${when(r.reviewedAt)}${r.reviewedBy ? ` · ${shortId(r.reviewedBy)}` : ""}` : "—"}</td>
                      <td className="right">
                        {r.status === "pending" ? (
                          <span className="row gap">
                            <button type="button" className="btn primary small" disabled={working} onClick={() => decide(r.id, "approve")}>
                              {working ? "…" : "Approve"}
                            </button>
                            <button type="button" className="btn secondary small" disabled={working} onClick={() => decide(r.id, "reject")}>
                              Reject
                            </button>
                          </span>
                        ) : r.status === "approved" ? (
                          <button type="button" className="btn secondary small" disabled={working} onClick={() => decide(r.id, "revoke")}>
                            {working ? "…" : "Remove"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="details">
                        <td colSpan={5}>
                          <div className="evidence">
                            <div className="score" aria-label={`classifier score ${r.detectorScore ?? "unknown"}`}>
                              <b>{r.detectorScore === null ? "?" : r.detectorScore.toFixed(2)}</b>
                              <span>injection score</span>
                            </div>
                            <blockquote>{r.excerpt || "No excerpt was recorded for this request."}</blockquote>
                          </div>
                          <dl className="facts">
                            <dt>Document</dt>
                            <dd className="break"><a href={r.url} target="_blank" rel="noreferrer noopener">{r.url}</a></dd>
                            {r.note ? (<><dt>Reason given</dt><dd>{r.note}</dd></>) : null}
                            {r.description ? (<><dt>Description</dt><dd>{r.description}</dd></>) : null}
                          </dl>
                          {r.status === "pending" && (
                            <p className="muted small">
                              Approving says <b>this is not an attack</b> — every guard still runs and the output rails stay
                              strict. Open the document and read it first.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Row>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Two sibling <tr> need one key; a fragment carries it without adding an element a <tbody> may not contain. */
const Row = ({ children }: { children: React.ReactNode }) => <>{children}</>;

const LABEL: Record<string, string> = {
  pending: "Waiting",
  approved: "Approved",
  rejected: "Rejected",
  revoked: "Taken back",
};

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
/** A Cognito sub is 36 characters of nothing a reader can use; its head tells two reviewers apart. */
const shortId = (s: string) => (s.length > 12 ? `${s.slice(0, 8)}…` : s);
const host = (u: string) => {
  try {
    const { hostname, pathname } = new URL(u);
    const parts = pathname.split("/").filter(Boolean);
    return parts.length >= 2 ? `${hostname} · ${parts[0]}/${parts[1]}` : hostname;
  } catch {
    return u;
  }
};
