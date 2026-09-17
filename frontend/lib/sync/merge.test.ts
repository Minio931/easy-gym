import { describe, expect, it } from "vitest";
import { isStrictlyNewer, nextSince, shouldAcceptIncoming, SINCE_MARGIN_MS } from "@/lib/sync/merge";
import type { SetSync } from "@/types/sync";

function set(id: string, updatedAt: string): SetSync {
  return {
    id,
    workoutExerciseId: "we-1",
    setIndex: 1,
    weightKg: 100,
    reps: 5,
    rpe: null,
    isWarmup: false,
    toFailure: false,
    assisted: false,
    completedAt: updatedAt,
    updatedAt,
    deletedAt: null,
  };
}

describe("shouldAcceptIncoming", () => {
  it("przyjmuje rekord, którego lokalnie nie ma", () => {
    expect(shouldAcceptIncoming(undefined, set("s1", "2026-09-17T10:00:00Z"))).toBe(true);
  });

  it("przyjmuje wersję serwera, gdy lokalny wiersz jest czysty -- nawet jeśli jest starsza", () => {
    // Czysty wiersz nie ma niewysłanych zmian, więc nie ma o co się spierać.
    const local = { updatedAt: "2026-09-17T12:00:00Z", dirty: 0 as const };
    expect(shouldAcceptIncoming(local, set("s1", "2026-09-17T10:00:00Z"))).toBe(true);
  });

  it("broni lokalnej zmiany, która jest ściśle nowsza i jeszcze nie wysłana", () => {
    const local = { updatedAt: "2026-09-17T12:00:00Z", dirty: 1 as const };
    expect(shouldAcceptIncoming(local, set("s1", "2026-09-17T11:59:59Z"))).toBe(false);
  });

  it("przy remisie ustępuje serwerowi, tak samo jak serwer przy remisie zostaje przy swoim", () => {
    // To jest cała istota zgodności reguł: serwer stosuje ściśle `>`, więc
    // gdyby klient przy remisie bronił swojej wersji, obie strony uznałyby się
    // za zwycięzcę i rekord rozjechałby się bez żadnego sygnału.
    const stamp = "2026-09-17T12:00:00Z";
    const local = { updatedAt: stamp, dirty: 1 as const };
    expect(shouldAcceptIncoming(local, set("s1", stamp))).toBe(true);
  });

  it("brudny wiersz ustępuje nowszej wersji serwera", () => {
    const local = { updatedAt: "2026-09-17T10:00:00Z", dirty: 1 as const };
    expect(shouldAcceptIncoming(local, set("s1", "2026-09-17T12:00:00Z"))).toBe(true);
  });

  it("tombstone z serwera wygrywa z lokalnym żywym rekordem, gdy jest nowszy", () => {
    // Skasowanie na drugim urządzeniu to zwykła zmiana z nowszym updatedAt.
    const local = { updatedAt: "2026-09-17T10:00:00Z", dirty: 0 as const };
    const tombstone: SetSync = { ...set("s1", "2026-09-17T12:00:00Z"), deletedAt: "2026-09-17T12:00:00Z" };
    expect(shouldAcceptIncoming(local, tombstone)).toBe(true);
  });

  it("różne strefy tego samego momentu to remis, nie porównanie tekstowe", () => {
    // "2026-09-17T12:00:00Z" i "2026-09-17T14:00:00+02:00" to ta sama chwila;
    // porównanie stringów dałoby tu przypadkowy wynik.
    const local = { updatedAt: "2026-09-17T14:00:00+02:00", dirty: 1 as const };
    expect(shouldAcceptIncoming(local, set("s1", "2026-09-17T12:00:00Z"))).toBe(true);
  });
});

describe("isStrictlyNewer", () => {
  it("jest ścisłe -- remis to nie 'nowszy'", () => {
    expect(isStrictlyNewer("2026-09-17T12:00:00Z", "2026-09-17T12:00:00Z")).toBe(false);
    expect(isStrictlyNewer("2026-09-17T12:00:00.001Z", "2026-09-17T12:00:00Z")).toBe(true);
  });
});

describe("nextSince", () => {
  it("cofa serverTime o margines, żeby nie przegapić zapisu z równoległej sesji", () => {
    const result = nextSince("2026-09-17T12:00:00.000Z");
    expect(Date.parse(result)).toBe(Date.parse("2026-09-17T12:00:00.000Z") - SINCE_MARGIN_MS);
  });

  it("margines jest parametrem, nie sztywną stałą", () => {
    expect(nextSince("2026-09-17T12:00:00.000Z", 1000)).toBe("2026-09-17T11:59:59.000Z");
  });

  it("zepsuty znacznik z serwera cofa do epoki zamiast blokować synchronizację", () => {
    // Lepiej raz zaciągnąć wszystko niż cicho przestać się synchronizować.
    expect(nextSince("to nie jest data")).toBe(new Date(0).toISOString());
  });
});
