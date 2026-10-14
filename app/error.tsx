"use client";
import { useEffect } from "react";
import { reportClientError } from "@/lib/client-log";

/** Error boundary for every page: a short message, a retry, and a report to the server log. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportClientError(error, "react", error.digest), [error]);
  return (
    <main className="shell">
      <section className="card" style={{ marginTop: 48 }}>
        <h1>Something went wrong</h1>
        <p className="muted">The page hit an unexpected error. It has been reported. You can try again or go back to the dashboard.</p>
        <p className="row">
          <button className="btn" onClick={reset}>Try again</button>
          <a className="btn secondary" href="/app">Back to dashboard</a>
        </p>
      </section>
    </main>
  );
}
