import { ReviewQueue } from "@/components/ReviewQueue";

export const dynamic = "force-dynamic";

/** The review queue. Visible to anyone with the link; the API refuses the data to anyone who is not an administrator. */
export default function ReviewPage() {
  return (
    <main>
      <h1>Documents waiting for review</h1>
      <p className="muted">
        The prompt-injection classifier refused these documents and somebody asked for a second look. It is wrong often
        enough on real READMEs that a person should decide.
      </p>
      <ReviewQueue />
    </main>
  );
}
