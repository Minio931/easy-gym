/**
 * Błąd HTTP z API. `status` jest tu ważniejszy od komunikatu -- 401 uruchamia
 * ścieżkę refresh/wylogowanie, reszta idzie do UI jako tekst.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Brak sieci (fetch odrzucony przed odpowiedzią). Osobna klasa, bo w tej apce
 * offline NIE jest awarią -- UI pokazuje inny stan niż przy błędzie serwera
 * (DESIGN.md §7.4).
 */
export class OfflineError extends Error {
  constructor(cause?: unknown) {
    super("Brak połączenia z serwerem");
    this.name = "OfflineError";
    this.cause = cause;
  }
}

/**
 * Żądanie przerwane przez `AbortController`. Musi być odsiane od prawdziwych
 * błędów: React w trybie ścisłym uruchamia efekt dwa razy (mount → cleanup →
 * mount), więc pierwszy fetch zawsze zostaje przerwany. Potraktowanie tego
 * jako awarii zostawia ekran w stanie błędu mimo udanego drugiego żądania.
 */
export function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/** Komunikat dla użytkownika, po polsku, bez wycieku szczegółów technicznych. */
export function messageForUser(error: unknown): string {
  if (error instanceof OfflineError) {
    return "Brak połączenia. Dane zostaną wysłane, gdy wróci sieć.";
  }
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        return "Nieprawidłowy login lub hasło.";
      case 400:
        return "Nieprawidłowe dane.";
      case 409:
        return "Konflikt danych.";
      default:
        return error.message || "Coś poszło nie tak po stronie serwera.";
    }
  }
  return "Coś poszło nie tak.";
}
