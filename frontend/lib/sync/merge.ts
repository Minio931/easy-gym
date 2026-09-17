import type { SyncRecord } from "@/types/sync";

/**
 * Reguły rozstrzygania konfliktu — czyste funkcje, bez Dexie i bez sieci,
 * bo to jedyna część synchronizacji, w której da się pomylić w sposób cichy.
 *
 * Reguła jest ta sama po obu stronach (backend/API.md, „Reguły rozstrzygania"):
 * **last-write-wins po `updatedAt`, ściśle `>`, remis wygrywa serwer.**
 * Gdyby klient stosował `>=` tam, gdzie serwer stosuje `>`, przy równych
 * znacznikach obie strony uznałyby się za zwycięzcę i rekord różniłby się
 * między urządzeniami bez żadnego sygnału, że coś jest nie tak.
 */

/**
 * Czy wersja z serwera ma nadpisać lokalną?
 *
 * `local === undefined` to nowy rekord — bierzemy. Dla lokalnego wiersza
 * czystego (`dirty = 0`) też bierzemy zawsze: skoro nie mamy niewysłanych
 * zmian, serwer z definicji wie lepiej, a jego rekord może być nowszy również
 * wtedy, gdy znaczniki są równe (ten sam zapis, który sami wysłaliśmy).
 *
 * Spór jest tylko wtedy, gdy lokalny wiersz jest brudny: wygrywa on wyłącznie
 * wtedy, gdy jest **ściśle nowszy**. Przy remisie ustępuje serwerowi — inaczej
 * zostałby brudny na zawsze i wracał w każdej kolejnej paczce.
 */
export function shouldAcceptIncoming(
  local: { updatedAt: string; dirty: 0 | 1 } | undefined,
  incoming: SyncRecord,
): boolean {
  if (local === undefined || local.dirty === 0) {
    return true;
  }
  return !isStrictlyNewer(local.updatedAt, incoming.updatedAt);
}

/** `a > b` na znacznikach ISO-8601. */
export function isStrictlyNewer(a: string, b: string): boolean {
  return Date.parse(a) > Date.parse(b);
}

/**
 * Margines bezpieczeństwa dla `since` (backend/API.md, reguła 8).
 *
 * `serverTime` to znacznik POCZĄTKU transakcji, ale drugie urządzenie może
 * mieć własną transakcję w locie, która zatwierdzi się o milisekundę później
 * z wcześniejszym `updatedAt`. Bez cofnięcia `since` taki zapis nie trafiłby
 * do żadnego kolejnego zaciągu i zniknąłby z tego urządzenia na zawsze.
 *
 * Kosztem jest kilka rekordów przysyłanych ponownie przy każdej synchronizacji
 * — to samo `id` i to samo `updatedAt`, więc `shouldAcceptIncoming` przepuszcza
 * je bez żadnego skutku.
 */
export const SINCE_MARGIN_MS = 5 * 60 * 1000;

export function nextSince(serverTime: string, marginMs: number = SINCE_MARGIN_MS): string {
  const parsed = Date.parse(serverTime);
  if (Number.isNaN(parsed)) {
    // Zepsuty znacznik z serwera nie może cicho zablokować synchronizacji:
    // `null` oznacza pełny zaciąg następnym razem — drożej, ale poprawnie.
    return new Date(0).toISOString();
  }
  return new Date(parsed - marginMs).toISOString();
}
