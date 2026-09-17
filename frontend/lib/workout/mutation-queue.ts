import { ApiError, OfflineError } from "@/lib/api/errors";

/**
 * Szeregowa kolejka zapisów. Jedno zadanie naraz, ściśle FIFO — dwie edycje
 * tej samej serii muszą dojechać w kolejności, w jakiej user je zrobił,
 * inaczej ostatnie słowo ma wyścig, a nie użytkownik.
 *
 * Nieudany zapis ponawiamy po cichu (3 próby, backoff 1/3/9 s) i dopiero
 * potem pokazujemy pigułkę błędu — zgodnie ze specyfikacją §4. Ponawiamy
 * wyłącznie błędy przejściowe: brak sieci, 5xx, 408, 429. `400` czy `404` nie
 * naprawią się od powtórzenia, a zapętlone retry blokowałyby kolejkę.
 *
 * W etapie 5 ta kolejka dostanie trwałość (Dexie) — kształt zadania
 * (`id` + `label` + `run`) jest już pod to przygotowany.
 */

export interface Mutation {
  id: string;
  /** Opis dla listy nieudanych zmian, po polsku. */
  label: string;
  run: () => Promise<void>;
}

export interface FailedMutation {
  id: string;
  label: string;
  message: string;
  retry: () => void;
}

export interface QueueStatus {
  pending: number;
  failed: FailedMutation[];
}

const BACKOFF_MS = [1_000, 3_000, 9_000];

function isTransient(error: unknown): boolean {
  if (error instanceof OfflineError) {
    return true;
  }
  if (error instanceof ApiError) {
    return error.status >= 500 || error.status === 408 || error.status === 429;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class MutationQueue {
  private readonly queue: Mutation[] = [];
  private readonly failed: FailedMutation[] = [];
  private running = false;

  constructor(private readonly onStatusChange: (status: QueueStatus) => void) {}

  /** Ile zadań czeka POZA aktualnie wykonywanym. */
  remaining(): number {
    return this.queue.length;
  }

  status(): QueueStatus {
    return { pending: this.queue.length + (this.running ? 1 : 0), failed: [...this.failed] };
  }

  submit(mutation: Mutation): void {
    this.queue.push(mutation);
    this.notify();
    void this.pump();
  }

  retryAll(): void {
    if (this.failed.length === 0) {
      return;
    }
    const again = this.failed.splice(0, this.failed.length);
    for (const entry of again) {
      entry.retry();
    }
  }

  private notify(): void {
    this.onStatusChange(this.status());
  }

  private async pump(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    while (this.queue.length > 0) {
      const mutation = this.queue.shift();
      if (mutation === undefined) {
        break;
      }
      this.notify();
      await this.attempt(mutation);
      this.notify();
    }
    this.running = false;
    this.notify();
  }

  private async attempt(mutation: Mutation): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await mutation.run();
        return;
      } catch (error) {
        const canRetry = isTransient(error) && attempt < BACKOFF_MS.length;
        if (!canRetry) {
          this.failed.push({
            id: mutation.id,
            label: mutation.label,
            message: error instanceof Error ? error.message : "Nieznany błąd",
            retry: () => {
              this.submit(mutation);
            },
          });
          return;
        }
        await sleep(BACKOFF_MS[attempt]);
      }
    }
  }
}
