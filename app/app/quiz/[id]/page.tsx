import { QuizRunner } from "@/components/QuizRunner";

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main>
      <p><a href="/app">← All quizzes</a></p>
      <QuizRunner quizId={id} />
    </main>
  );
}
