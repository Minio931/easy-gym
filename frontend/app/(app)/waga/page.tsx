import { EmptyState, Screen, SectionLabel } from "@/components/ui/screen";

export default function BodyWeightPage() {
  return (
    <Screen>
      <SectionLabel>Waga ciała</SectionLabel>
      <EmptyState message="Brak pomiarów. Szybki wpis wagi, średnie tygodniowe ISO i wykres trendu dochodzą w etapie 7." />
      <p className="meta mt-4">
        Reguły średnich (tydzień ISO, tygodnie niepełne, pomijanie deloadu) są już policzone w
        lib/metrics.ts i pokryte testami.
      </p>
    </Screen>
  );
}
