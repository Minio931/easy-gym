import Link from "next/link";
import { EmptyState, Screen, SectionLabel } from "@/components/ui/screen";

export default function DashboardPage() {
  return (
    <Screen>
      <SectionLabel>Ten tydzień</SectionLabel>
      <EmptyState
        message="Nie ma jeszcze żadnych danych. Wykresy objętości, kalendarz treningów i ostatnie rekordy pojawią się tu po pierwszej sesji."
        action={
          <Link
            href="/trening"
            className="h-control inline-flex items-center rounded-control bg-cta px-5 font-semibold text-cta-ink"
          >
            Rozpocznij trening
          </Link>
        }
      />
      <p className="meta mt-4">
        Agregaty pulpitu liczy backend (GROUP BY/SUM), nie przeglądarka — etap 8.
      </p>
    </Screen>
  );
}
