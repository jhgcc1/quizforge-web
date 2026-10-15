"use client";
import { useEffect, useState } from "react";

interface Me { sub?: string | null; name?: string; email?: string; label?: string | null }

const short = (s: string) => (s.length > 14 ? `${s.slice(0, 8)}…` : s);

export function UserMenu() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    fetch("/bff/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Me | null) => setMe(j))
      .catch(() => undefined);
  }, []);
  // older BFF answered only {sub}: keep working with it
  const label = me?.label ?? me?.name ?? me?.email ?? (me?.sub ? short(me.sub) : null);
  const who = [me?.name, me?.email && me.email !== me.name ? me.email : undefined].filter(Boolean).join(" · ");
  return (
    <form method="post" action="/auth/logout" className="row" style={{ minWidth: 0 }}>
      {label && (
        <span
          className="muted small"
          data-testid="user-label"
          title={who ? `Signed in as ${who}` : "Signed in (account id)"}
          style={{ maxWidth: "min(220px, 40vw)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block" }}
        >
          {label}
        </span>
      )}
      <button className="btn secondary" type="submit">Sign out</button>
    </form>
  );
}
