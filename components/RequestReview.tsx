"use client";
import { useState, type ReactNode } from "react";
import { CreateDocumentRequestBodySchema, DocumentRequestSchema } from "@quizforge/contract";
import { ApiError, api } from "@/lib/api";

/**
 * Shown when the prompt-injection classifier refused the document (`quiz.reviewable`).
 *
 * The classifier scores some real READMEs above the block threshold, so a refusal is not proof of an attack and the user
 * should not be left at a dead end. Nothing about the document is typed here: the request points at this quiz, and the
 * API takes the URL and the score from it.
 *
 * `children` is the way out of this screen (normally "Back to dashboard"). It belongs in the same row as the button that
 * asks for a review, so the two read as a choice instead of two stacked blue slabs; while the form is open it steps
 * aside, because Cancel is the way back then.
 */
export function RequestReview({ quizId, sourceUrl, children }: { quizId: string; sourceUrl: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "sent") {
    return (
      <>
        <p className="alert ok" role="status">
          Thanks — an administrator will look at this document. If it is approved it appears in the document list for everyone.
        </p>
        {children ? <div className="row actions">{children}</div> : null}
      </>
    );
  }

  if (!open) {
    return (
      <div className="row actions">
        <button type="button" className="btn primary" onClick={() => setOpen(true)}>
          Ask for this document to be reviewed
        </button>
        {children}
      </div>
    );
  }

  const send = async () => {
    setError(null);
    const body = CreateDocumentRequestBodySchema.safeParse({ quizId, title: title.trim(), ...(note.trim() ? { note: note.trim() } : {}) });
    if (!body.success) return setError("Give the document a title of at least two characters.");
    setState("sending");
    try {
      await api("/v1/document-requests", { method: "POST", body: body.data, schema: DocumentRequestSchema });
      setState("sent");
    } catch (e) {
      setState("idle");
      setError(e instanceof ApiError && e.status === 409 ? "Somebody already asked for this document; it is waiting for review." : (e as Error).message);
    }
  };

  return (
    <div className="card">
      <h2>Ask for a review</h2>
      <p className="muted small">
        A person will look at <code className="break">{sourceUrl}</code> and at what the classifier found. Approved documents join the list
        everyone can pick from.
      </p>
      <div className="field">
        <label htmlFor="review-title">Name for the document</label>
        <input id="review-title" type="text" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Elasticsearch README" />
      </div>
      <div className="field">
        <label htmlFor="review-note">Why do you think it is safe? <span className="muted">(optional)</span></label>
        <textarea id="review-note" value={note} maxLength={500} rows={4} onChange={(e) => setNote(e.target.value)} placeholder="e.g. it is the README of a well-known project" />
      </div>
      {error ? <p className="alert error" role="alert">{error}</p> : null}
      <div className="row actions">
        <button type="button" className="btn primary" disabled={state === "sending"} onClick={send}>
          {state === "sending" ? "Sending…" : "Send request"}
        </button>
        <button type="button" className="btn secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
