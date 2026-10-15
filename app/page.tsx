import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { webConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  login_denied: "Sign-in was cancelled.",
  invalid_state: "That sign-in link expired. Please try again.",
  token_exchange_failed: "Could not complete sign-in. Please try again.",
};

const providerLabel = { google: "Google", facebook: "Facebook" } as const;

export default async function Landing({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const jar = await cookies();
  if (jar.get("qf_at") || jar.get("qf_rt")) redirect("/app");
  const { error } = await searchParams;
  const cfg = webConfig();
  if (cfg.authMode === "cognito") {
    // The login page IS the Cognito Hosted UI (e-mail, sign-up link, Google, Facebook). No landing of our own.
    // A failed login comes back with ?error=: show it instead of redirecting again, otherwise it would loop.
    if (!error) redirect("/auth/login");
    return (
      <main className="shell">
        <header className="topbar"><a className="brand" href="/">Quiz<span>Forge</span></a></header>
        <section className="card" style={{ marginTop: 48 }}>
          <h1>Sign-in problem</h1>
          <p className="alert error" role="alert">{messages[error] ?? "Sign-in failed."}</p>
          <nav aria-label="Sign in" className="row">
            <a className="btn" href="/auth/login">Try again</a>
          </nav>
        </section>
      </main>
    );
  }
  // AUTH_MODE=local (development simulation): the page the end-to-end suite drives.
  return (
    <main className="shell">
      <header className="topbar"><a className="brand" href="/">Quiz<span>Forge</span></a></header>
      <section className="card" style={{ marginTop: 48 }}>
        <h1>Turn any README into a quiz</h1>
        <p className="muted">
          Point QuizForge at a Markdown document. An AI agent writes 5 to 8 multiple-choice questions grounded in the text,
          you answer them, and the score is a weighted average that rewards the harder, later questions.
        </p>
        {error && <p className="alert error" role="alert">{messages[error] ?? "Sign-in failed."}</p>}
        <nav aria-label="Sign in options" className="row">
          <a className="btn" href="/auth/login">Sign in</a>
          {cfg.allowSignup && <a className="btn secondary" href="/auth/login?mode=signup">Create account</a>}
        </nav>
        {cfg.socialProviders.length > 0 && (
          <nav aria-label="Social sign in" className="row" style={{ marginTop: 12 }}>
            {cfg.socialProviders.map((p) => (
              <a key={p} className="btn secondary" href={`/auth/login?provider=${p}`}>Continue with {providerLabel[p]}</a>
            ))}
          </nav>
        )}
        {cfg.authMode === "local" && (cfg.allowSignup || cfg.socialProviders.length > 0) && (
          <p className="muted small">Local development: sign-up and Google/Facebook are a simulation, no real accounts are used.</p>
        )}
        <p className="muted small">
          {cfg.allowSignup
            ? "New here? Create an account with your e-mail (we send a code to verify it) or continue with Google or Facebook."
            : "Accounts are created by an administrator. There is no public sign-up."}
        </p>
      </section>
    </main>
  );
}
