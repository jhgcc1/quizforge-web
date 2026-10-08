import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  login_denied: "Sign-in was cancelled.",
  invalid_state: "That sign-in link expired. Please try again.",
  token_exchange_failed: "Could not complete sign-in. Please try again.",
};

export default async function Landing({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const jar = await cookies();
  if (jar.get("qf_at") || jar.get("qf_rt")) redirect("/app");
  const { error } = await searchParams;
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
        <p><a className="btn" href="/auth/login">Sign in</a></p>
        <p className="muted small">Accounts are created by an administrator. There is no public sign-up.</p>
      </section>
    </main>
  );
}
