import { ExerciseScreen } from "@/components/exercise/exercise-screen";

export default async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExerciseScreen exerciseId={id} />;
}
