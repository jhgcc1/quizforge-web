"use client";
import { useEffect, useState } from "react";

export function UserMenu() {
  const [sub, setSub] = useState<string | null>(null);
  useEffect(() => {
    fetch("/bff/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setSub(j?.sub ?? null))
      .catch(() => undefined);
  }, []);
  return (
    <form method="post" action="/auth/logout" className="row">
      {sub && <span className="muted small" title="Your account id">{sub.length > 14 ? `${sub.slice(0, 8)}…` : sub}</span>}
      <button className="btn secondary" type="submit">Sign out</button>
    </form>
  );
}
