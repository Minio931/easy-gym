# easy-gym-backend

Spring Boot API dla aplikacji do śledzenia treningu. Jedyny serwer aplikacji — bez Supabase, bez PostgREST. Frontend (Next.js PWA, `../frontend/`) jest poza zakresem tego katalogu i tej dokumentacji.

## Stack

- Java 26 (toolchain), Spring Boot 4.1.1, Gradle (Kotlin DSL)
- Postgres jako jedyna baza danych, Flyway do migracji (`src/main/resources/db/migration/`)
- Docelowo (kolejne etapy): Spring Security + JWT (access + refresh), Spring Data JPA, Apache POI do eksportu XLSX
- Testy: JUnit 5 + Testcontainers (`postgres:16-alpine`) — testy integracyjne odpalają prawdziwego Postgresa w kontenerze, nie H2. Wymaga działającego Dockera lokalnie i w CI.

## Decyzje architektoniczne (etap 1)

Pełne założenia z promptu projektowego — potwierdzone, z jednym zastrzeżeniem:

1. **Własny Auth, dwóch znanych użytkowników.** Konta tworzone ręcznie (seed/endpoint admina), bez self-service rejestracji i resetu hasła mailem. Login + hasło (bcrypt) → JWT access + refresh. Refresh tokeny trzymane jako hash w tabeli `refresh_tokens` (nie ma jej literalnie w sekcji 2 promptu — dodana, bo bez niej nie da się unieważnić refresh tokenu przy wylogowaniu).

2. **Izolacja `user_id` w warstwie serwisowej Springa, nie RLS w Postgresie.** Potwierdzone jako świadomy kompromis, zgodnie z życzeniem — ale z zastrzeżeniem: przy dwóch użytkownikach i całej logice przechodzącej przez jeden serwis Springa ryzyko jest realne, jeśli ktoś doda nowy endpoint/query i zapomni o filtrze `user_id`. RLS w Postgresie byłby drugą, niezależną linią obrony (baza odrzuca zapytanie bez `SET app.user_id`, nawet jeśli serwis ma buga) kosztem dodatkowej konfiguracji sesji DB per request. **Rekomendacja: zostawić jak ustalono (bez RLS), ale każdy nowy endpoint czytający/piszący dane per-user musi mieć test integracyjny "user A nie widzi/nie modyfikuje danych usera B"** — to jest twardy wymóg, nie nice-to-have, i będzie egzekwowany w kolejnych etapach.

3. **Postgres: rekomendacja — Neon.** Dla projektu dwuosobowego non-profit: darmowy tier wystarczający na ten ruch, autoscaling do zera (nie płacisz za bezczynność między sesjami na siłowni), branching bazy przydatny do testowania migracji przed produkcją, natywne wsparcie `pgcrypto`/`pg_trgm` (obie używane w migracjach). Railway i Render też są sensowne (prostszy model "jeden kontener na wszystko"), ale Neon jest wyceniony specyficznie pod ten profil obciążenia (bursty, niski always-on ruch). Decyzja nie blokuje etapu 1 — schemat i migracje są providerowi obojętne, konfiguracja `DB_URL`/`DB_USERNAME`/`DB_PASSWORD` w `application.yaml` już to zakłada.

4. **Endpoint synchronizacji Dexie** — zaprojektowany od razu jako część API (etap 5), nie dolepiany później. Konsekwencja widoczna już w schemacie: każda tabela synchronizowana z klienta ma `id UUID` (bez `DEFAULT`, bo generuje go klient), `updated_at` (last-write-wins) i `deleted_at` (soft delete / tombstone — zwykłe `DELETE FROM` nie zsynchronizowałoby kasowania na inne urządzenie).

5. **Eksport XLSX przez Apache POI** — potwierdzone, realizacja w etapie 9.

### Rozszerzenia względem literalnej specyfikacji z promptu (sekcja 2)

Sekcja 2 promptu nie wymienia `updated_at`/`deleted_at` przy każdej tabeli — dodane, bo wymaga tego mechanizm sync opisany w sekcji 1 punkt 4 (last-write-wins po `updated_at`, offline delete musi się zsynchronizować). Bez tych kolumn endpoint sync z etapu 5 nie miałby jak działać. Jeśli to nadmiarowe względem Twojej wizji — powiedz, zanim zacznę etap 5 (endpoint sync), bo zmiana kształtu tabel później to migracja Flyway `ALTER TABLE`, nie coś do przepisania po cichu.

`profiles.unit` zostawione jako `TEXT CHECK (unit = 'kg')` zamiast enuma — prompt mówi wprost `unit ('kg')`, czyli na razie jedna wartość. Jeśli w przyszłości ma być wybór kg/lb, to inna migracja (dodanie `'lb'` do `CHECK`), nie blokuje niczego teraz.

## Struktura

```
backend/
  build.gradle.kts
  docker-compose.yml            # Postgres lokalnie do developmentu (nie do produkcji)
  src/main/resources/
    application.yaml            # config przez zmienne środowiskowe, sensowne defaulty do dev
    db/migration/
      V1__enable_extensions.sql       # pgcrypto (gen_random_uuid), pg_trgm (fuzzy search ćwiczeń)
      V2__create_users_and_auth.sql   # users, profiles, refresh_tokens
      V3__create_training_schema.sql  # exercises, routines, routine_items, workouts,
                                       # workout_exercises, sets, body_weights + indeksy
      V4__seed_global_exercises.sql   # 60 ćwiczeń PL, user_id NULL, UUID-y stałe (idempotentny seed)
  src/main/java/com/example/easygymbackend/
    EasyGymBackendApplication.java
  src/test/java/com/example/easygymbackend/
    EasyGymBackendApplicationTests.java   # smoke test kontekstu Springa (Testcontainers Postgres)
    db/SchemaMigrationTest.java           # weryfikuje migracje: seed = 60, CHECK-i, unikalność
                                           # body_weights per dzień po soft-delete
```

Pakiety domenowe (`auth`, `exercises`, `workouts`, `sync`, ...) dojdą w etapie 2 wraz ze szkieletem Springa — na razie jest tylko schemat bazy.

## Model danych — skrót

Patrz migracje w `db/migration/` jako źródło prawdy (nie duplikuj tego opisu przy zmianach schematu — aktualizuj tylko migracje + testy). Kluczowe reguły:

- Wszystkie tabele synchronizowane z klienta: `id UUID` bez serwerowego `DEFAULT`, `updated_at` (LWW), `deleted_at` (soft delete).
- `exercises.user_id IS NULL` = ćwiczenie globalne (seed), widoczne dla wszystkich kont.
- `sets`: `weight_kg` 0–500, `reps` 1–100, `rpe` 1–10 (nullable) — egzekwowane `CHECK` w bazie, nie tylko walidacją w Springu.
- `body_weights`: jeden **żywy** wpis na `(user_id, measured_on)` — częściowy unikalny indeks `WHERE deleted_at IS NULL`, żeby soft-deleted wpis nie blokował nowego wpisu tego samego dnia.

## Jak uruchomić lokalnie

1. `docker compose up -d` — startuje Postgres na `localhost:5432` (baza `easy_gym`, user/hasło `easy_gym`/`easy_gym`, zgodnie z defaultami w `application.yaml`).
2. `./gradlew bootRun` — Spring Boot aplikuje migracje Flyway automatycznie przy starcie (`spring.flyway.enabled: true`).
3. Weryfikacja ręczna schematu:
   ```
   docker exec -it easy-gym-postgres psql -U easy_gym -d easy_gym -c "\dt"
   docker exec -it easy-gym-postgres psql -U easy_gym -d easy_gym -c "SELECT count(*) FROM exercises WHERE user_id IS NULL;"
   ```
   Drugie zapytanie musi zwrócić `60`.

## Jak uruchomić testy

```
./gradlew test
```

Wymaga działającego Dockera (Testcontainers odpala `postgres:16-alpine` per klasa testowa). Bez Dockera testy integracyjne (`EasyGymBackendApplicationTests`, `SchemaMigrationTest`) nie wystartują — to nie jest opcjonalne w tym projekcie, bo cała logika izolacji `user_id` (punkt 2 wyżej) będzie testowana tak samo, na prawdziwym Postgresie, nie na H2 z inną semantyką.

Zmienne środowiskowe do produkcji/staging (nie ustawiaj lokalnie, jeśli używasz `docker-compose.yml` z defaultami):

| Zmienna | Opis |
|---|---|
| `DB_URL` | JDBC URL do Postgresa managed (np. Neon) |
| `DB_USERNAME` / `DB_PASSWORD` | dane logowania do bazy |
| `SERVER_PORT` | port HTTP (default `8080`) |

## Postęp etapów

Zgodnie z promptem projektowym, realizowanym etapami (nie całość na raz):

- [x] **Etap 1 — schemat bazy.** Flyway V1–V4, seed 60 ćwiczeń, testy integracyjne na Testcontainers.
- [ ] Etap 2 — szkielet Springa (pakiety, konfiguracja) + Auth (JWT) + szkielet Next.js (poza zakresem `backend/`).
- [ ] Etap 3 — `lib/metrics.ts` (front) + lustrzana logika w Javie + testy Vitest/JUnit.
- [ ] Etap 4 — ekran aktywnego treningu (front).
- [ ] Etap 5 — offline sync (Dexie) + endpoint synchronizacji w Springu + plan testowania konfliktów.
- [ ] Etap 6 — historia treningów, ekran ćwiczenia (front, zapytania zagregowane w Springu).
- [ ] Etap 7 — moduł wagi ciała (front + agregacje tygodniowe w Springu).
- [ ] Etap 8 — dashboard (agregacje w Springu).
- [ ] Etap 9 — eksport XLSX (Apache POI).

## Konwencje

- Migracje Flyway: nigdy nie edytuj już zastosowanej migracji (`V1`...`V4` po merge do main) — nowa zmiana schematu to zawsze kolejny numer (`V5__...`).
- Każdy endpoint operujący na danych per-user filtruje po `user_id` z JWT w warstwie serwisowej — bez wyjątków (patrz decyzja 2 wyżej). Test "izolacja user A / user B" jest obowiązkowy przy każdym takim endponcie.
- Agregacje (sumy objętości, średnie tygodniowe, PR) liczone SQL/JPQL po stronie Springa, nie ściąganiem wszystkich wierszy do pamięci serwisu (sekcja 9 promptu).
