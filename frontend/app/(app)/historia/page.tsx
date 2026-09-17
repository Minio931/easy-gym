import { EmptyState, Screen, SectionLabel } from "@/components/ui/screen";

export default function HistoryPage() {
  return (
    <Screen>
      <SectionLabel>Historia</SectionLabel>
      <EmptyState message="Brak zapisanych treningów. Lista sesji i ekran pojedynczego ćwiczenia z wykresami dochodzą w etapie 6." />
    </Screen>
  );
}
