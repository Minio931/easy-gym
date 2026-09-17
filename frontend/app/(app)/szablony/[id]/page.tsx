import { RoutineEditorScreen } from "@/components/routines/routine-editor-screen";

/** `/szablony/nowy` to pusty edytor — nie ma osobnej trasy na tworzenie. */
export default async function RoutineEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RoutineEditorScreen routineId={id === "nowy" ? null : id} />;
}
