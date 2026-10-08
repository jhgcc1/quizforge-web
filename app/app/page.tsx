import { CreateQuizForm } from "@/components/CreateQuizForm";
import { QuizList } from "@/components/QuizList";

export default function Dashboard() {
  return (
    <main>
      <h1>Your quizzes</h1>
      <CreateQuizForm />
      <QuizList />
    </main>
  );
}
