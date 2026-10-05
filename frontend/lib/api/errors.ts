/**
 * HTTP error from the API. `status` matters more than the message here —
 * 401 triggers the refresh/logout path, the rest goes to the UI as text.
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
 * No network (fetch rejected before a response). A separate class, because
 * in this app offline is NOT a failure — the UI shows a different state than
 * for a server error (DESIGN.md §7.4).
 */
export class OfflineError extends Error {
  constructor(cause?: unknown) {
    super("No connection to the server");
    this.name = "OfflineError";
    this.cause = cause;
  }
}

/**
 * A request aborted by `AbortController`. Must be filtered out from real
 * errors: React strict mode runs an effect twice (mount → cleanup → mount),
 * so the first fetch always ends up aborted. Treating that as a failure
 * leaves the screen in an error state despite the successful second request.
 */
export function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/** Message for the user, in Polish, without leaking technical details. */
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
