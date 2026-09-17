import type { WorkoutDetailResponse } from "@/types/api";

/**
 * Migawka aktywnego treningu w `localStorage`. Wymóg PROMPT §3.5: zamknięcie
 * przeglądarki w połowie sesji nie może skasować treningu, a `/api/workouts/active`
 * potrzebuje sieci, której na siłowni bywa brak.
 *
 * Utrwalamy WYŁĄCZNIE to, co user zatwierdził. Niezatwierdzony szkic serii
 * (w tym wiersz wstępnie wypełniony po ✓) świadomie ginie przy zamknięciu
 * karty — wskrzeszony po dwóch dniach udawałby serię, której nikt nie zrobił.
 *
 * Etap 5 NIE zastąpił tego Dexie, tylko dołożył Dexie obok. Podział ról:
 * ta migawka jest synchronicznym cache'em ekranu (pełny trening w pierwszej
 * klatce po wejściu, bez czekania na asynchroniczny odczyt z IndexedDB),
 * a zapisem trwałym i źródłem dla synchronizacji jest `lib/db/`. Obie kopie
 * pisze `commit()` z tego samego `state.workout`, więc nie mają jak się
 * rozjechać, i obie giną przy wylogowaniu.
 */

const STORAGE_KEY = "easy-gym.active-workout";
const VERSION = 1;

export interface WorkoutSnapshot {
  version: number;
  /** Migawka należy do konta — inne konto na tym samym urządzeniu jej nie zobaczy. */
  userId: string;
  savedAt: string;
  workout: WorkoutDetailResponse;
}

export function readSnapshot(userId: string): WorkoutSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<WorkoutSnapshot>;
    if (parsed.version !== VERSION || parsed.userId !== userId) {
      return null;
    }
    if (typeof parsed.workout !== "object" || parsed.workout === null) {
      return null;
    }
    return {
      version: VERSION,
      userId,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
      workout: parsed.workout as WorkoutDetailResponse,
    };
  } catch {
    return null;
  }
}

export function writeSnapshot(userId: string, workout: WorkoutDetailResponse | null): void {
  if (typeof window === "undefined") {
    return;
  }
  if (workout === null) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  const snapshot: WorkoutSnapshot = {
    version: VERSION,
    userId,
    savedAt: new Date().toISOString(),
    workout,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Pełny albo zablokowany storage (tryb prywatny) nie może wywrócić
    // treningu — sesja dalej żyje w pamięci, traci tylko odporność na reload.
  }
}

export function clearSnapshot(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}
