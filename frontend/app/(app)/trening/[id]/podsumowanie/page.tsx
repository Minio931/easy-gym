import { WorkoutSummary } from "@/components/workout/workout-summary";

export default async function WorkoutSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkoutSummary workoutId={id} />;
}
