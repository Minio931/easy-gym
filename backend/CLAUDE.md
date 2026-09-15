# easy-gym-backend

Spring Boot API dla aplikacji do śledzenia treningu. Jedyny serwer aplikacji — bez Supabase, bez PostgREST. Frontend (Next.js PWA, `../frontend/`) jest poza zakresem tego katalogu i tej dokumentacji.

## Stack

- Java 26 (toolchain), Spring Boot 4.1.1, Gradle (Kotlin DSL)
- Postgres jako jedyna baza danych, Flyway do migracji (`src/main/resources/db/migration/`)
- Spring Security + JWT (access + refresh, `jjwt` 0.12.x), Spring Data JPA (`ddl-auto: validate` — Flyway jest jedynym źródłem prawdy o schemacie, Hibernate tylko sprawdza zgodność encji)
- Docelowo (kolejne etapy): Apache POI do eksportu XLSX
- Testy: JUnit 5 + Testcontainers (`postgres:16-alpine`) — testy integracyjne odpalają prawdziwego Postgresa w kontenerze, nie H2. Wymaga działającego Dockera lokalnie i w CI.

**Uwaga na Spring Boot 4 / Jackson 3 w tym projekcie — inne pakiety i moduły niż w tutorialach dla Boot 3:**
- Jackson: `tools.jackson.databind.ObjectMapper`, nie `com.fasterxml.jackson.databind.ObjectMapper`.
- `@AutoConfigureMockMvc`: `org.springframework.boot.webmvc.test.autoconfigure`, nie `org.springframework.boot.test.autoconfigure.web.servlet`.
- `MockMvc`/`MockMvcRequestBuilders`/`MockMvcResultMatchers` (z `spring-test`) zostały bez zmian w starych pakietach `org.springframework.test.web.servlet.*`.
- **Flyway wymaga `org.springframework.boot:spring-boot-starter-flyway`, samo `org.flywaydb:flyway-core` NIC nie odpala.** Boot 3 miał jeden monolityczny `spring-boot-autoconfigure.jar` z `FlywayAutoConfiguration` warunkowanym tylko `@ConditionalOnClass(Flyway.class)` — wystarczyło dodać `flyway-core` i działało. Boot 4 rozbił to na osobne moduły per-technologia (widać to też po pakiecie `org.springframework.boot.hibernate.autoconfigure.HibernateJpaConfiguration` w stack trace'ach) — `FlywayAutoConfiguration` żyje teraz w osobnym artefakcie `org.springframework.boot:spring-boot-flyway`, ciągniętym tylko przez `spring-boot-starter-flyway`. Bez tego: Flyway się nie odpala, zero błędu przy starcie, JPA/Hibernate po prostu waliduje pustą bazę i wywala `SchemaManagementException: missing table [...]` — mylący objaw, bo wygląda jak problem z migracją, a to brakująca zależność. Namierzone przez `find ~/.gradle/caches -iname "*.jar" | xargs grep -l FlywayAutoConfiguration.class` (nic nie znalazło) + przegląd BOM-u `spring-boot-dependencies-4.1.1.pom`.
- Ogólna zasada dla tego projektu: przy dziwnym, cichym błędzie w Spring Boot 4 podejrzewaj najpierw rozbicie autokonfiguracji na moduł, którego nie ma na classpath — sprawdź zawartość jarów w `~/.gradle/caches`, nie ufaj przykładom z internetu pisanym pod Boot 3.

## Decyzje architektoniczne (etap 1)

Pełne założenia z promptu projektowego — potwierdzone, z jednym zastrzeżeniem:

1. **Własny Auth, dwóch znanych użytkowników.** Konta tworzone ręcznie (seed/endpoint admina), bez self-service rejestracji i resetu hasła mailem. Login + hasło (bcrypt) → JWT access + refresh. Refresh tokeny trzymane jako hash w tabeli `refresh_tokens` (nie ma jej literalnie w sekcji 2 promptu — dodana, bo bez niej nie da się unieważnić refresh tokenu przy wylogowaniu).

2. **Izolacja `user_id` w warstwie serwisowej Springa, nie RLS w Postgresie.** Potwierdzone jako świadomy kompromis, zgodnie z życzeniem — ale z zastrzeżeniem: przy dwóch użytkownikach i całej logice przechodzącej przez jeden serwis Springa ryzyko jest realne, jeśli ktoś doda nowy endpoint/query i zapomni o filtrze `user_id`. RLS w Postgresie byłby drugą, niezależną linią obrony (baza odrzuca zapytanie bez `SET app.user_id`, nawet jeśli serwis ma buga) kosztem dodatkowej konfiguracji sesji DB per request. **Rekomendacja: zostawić jak ustalono (bez RLS), ale każdy nowy endpoint czytający/piszący dane per-user musi mieć test integracyjny "user A nie widzi/nie modyfikuje danych usera B"** — to jest twardy wymóg, nie nice-to-have, i będzie egzekwowany w kolejnych etapach.

3. **Postgres: rekomendacja — Neon.** Dla projektu dwuosobowego non-profit: darmowy tier wystarczający na ten ruch, autoscaling do zera (nie płacisz za bezczynność między sesjami na siłowni), branching bazy przydatny do testowania migracji przed produkcją, natywne wsparcie `pgcrypto`/`pg_trgm` (obie używane w migracjach). Railway i Render też są sensowne (prostszy model "jeden kontener na wszystko"), ale Neon jest wyceniony specyficznie pod ten profil obciążenia (bursty, niski always-on ruch). Decyzja nie blokuje etapu 1 — schemat i migracje są providerowi obojętne, konfiguracja `DB_URL`/`DB_USERNAME`/`DB_PASSWORD` w `application.yaml` już to zakłada.

4. **Endpoint synchronizacji Dexie** — zaprojektowany od razu jako część API (etap 5), nie dolepiany później. Konsekwencja widoczna już w schemacie: każda tabela synchronizowana z klienta ma `id UUID` (bez `DEFAULT`, bo generuje go klient), `updated_at` (last-write-wins) i `deleted_at` (soft delete / tombstone — zwykłe `DELETE FROM` nie zsynchronizowałoby kasowania na inne urządzenie).

5. **Eksport XLSX przez Apache POI** — potwierdzone, realizacja w etapie 9.

### Decyzje architektoniczne (etap 2 — Auth)

- **Tworzenie kont: `POST /api/admin/users`, chroniony osobnym sekretem (`X-Bootstrap-Secret`), nie JWT.** Pierwotnie planowany seed Flyway + ręczne generowanie bcrypt hasha lokalnie — zmienione na endpoint, bo wygodniejsze (zakładanie/zmiana konta bez nowej migracji Flyway za każdym razem) i tak samo bezpieczne przy dwóch znanych użytkownikach: sekret w `ADMIN_BOOTSTRAP_SECRET`, porównywany stałoczasowo (`MessageDigest.isEqual`), nie przez Spring Security/JWT — bo w momencie zakładania pierwszego konta nie ma jeszcze czym się zalogować. Endpoint jest `permitAll` na poziomie filter chain, autoryzację robi sam `AdminUserService`. Hasło w request body trafia tylko przez HTTPS bezpośrednio do `PasswordEncoder.encode()`, nigdy nie jest logowane ani zapisywane w czystej postaci.
- **Access token: JWT (15 min), refresh token: opaque random string (30 dni), nie JWT.** Refresh token to 256 bitów z `SecureRandom`, w bazie trzymany jako SHA-256 hash (`refresh_tokens.token_hash`) — analogicznie do `password_hash`. Wyciek bazy nie daje od razu działających tokenów.
- **Rotacja refresh tokenu przy każdym `/api/auth/refresh`.** Stary rekord dostaje `revoked_at`, powstaje nowy. Ponowne użycie starego refresh tokenu (replay) jest wykrywane i odrzucane — pokryte testem (`AuthControllerTest#refreshRotujeTokenINiePozwalaGoUzycPonownie`).
- **`CurrentUser.id()`** (`auth/CurrentUser.java`) to jedyny sposób, w jaki przyszłe kontrolery mają poznawać `user_id` wywołującego — nigdy z body/query requestu. To jest mechanizm egzekwujący decyzję 2 (izolacja w warstwie serwisowej) w praktyce.

### Decyzje architektoniczne (etap 3 — `metrics`, tylko backend)

Pakiet `metrics` to **czysta biblioteka obliczeniowa, celowo odłączona od encji JPA** — `workouts`/`sets`/`body_weights` jako encje Springa jeszcze nie istnieją (dojdą w etapach 4/6/7), więc funkcje operują na własnych, niezależnych rekordach (`ExerciseSet`, `BodyWeightEntry`, ...). To mirror `lib/metrics.ts` po stronie frontu (poza zakresem `backend/` — front realizuje to osobno, ten sam etap 3 po ich stronie). Wpięcie w realne repozytoria/serwisy nastąpi dopiero gdy powstaną domenowe encje.

Rzeczy, które NIE są oczywiste ze specyfikacji (sekcja 4), a zdecydowały o kształcie kodu:

- **Dwie różne "objętości sesji", nie jedna.** `SessionMetrics.displayVolumeKg` (do pokazania userowi, wlicza `assisted` — "fizyczna praca i tak wykonana") vs `SessionMetrics.prEligibleVolumeKg` (do trackingu PR "największa objętość w sesji", wyklucza `assisted` — sekcja 4 promptu explicite każe wykluczać `assisted` ze WSZYSTKICH trzech kategorii PR, mimo że osobno definiuje "objętość sesji" jako coś co assisted wlicza). Łatwo to przeoczyć i użyć jednego wzoru wszędzie — rozdzielone na dwie nazwane funkcje specjalnie, żeby się nie dało pomylić po cichu.
- **Formuła Brzyckiego (`weight × 36 / (37 − reps)`) dzieli przez zero przy reps=37, ujemny wynik powyżej.** Nieopisane w prompcie, ale realne przy `equipment='bodyweight'` + `to_failure` (np. pompki 40 powt.). `OneRepMax.estimate(...)` zwraca `Optional.empty()` dla reps > 36 przy Brzyckim zamiast fałszywej liczby — Epley nie ma tego problemu, liczy się zawsze.
- **e1RM i PR liczone zawsze na żywo, nigdy cache'owane.** Formuła (Epley/Brzycki) jest wyborem usera w ustawieniach — jeśli e1RM/PR-by-e1RM byłyby zapisane w bazie, zmiana formuły cicho zafałszowałaby historię. `PersonalRecordCalculator` bierze formułę jako parametr przy każdym wywołaniu.
- **`PersonalRecordCalculator.compute()` i `.brokenIn()` to ten sam algorytm, dwa wejścia.** `compute()` — aktualny stan rekordów. `brokenIn()` — które rekordy pobiła OSTATNIA sesja z chronologicznej listy (pod baner "PR pobity" w podsumowaniu treningu, sekcja 3.6, i pod kolumnę "czy PR" w eksporcie XLSX, sekcja 7 — to nie jest to samo co "czy to globalne maksimum", tylko "czy to był rekord W MOMENCIE wykonania"). Remis nie liczy się jako pobicie rekordu (ściśle `>`, nie `>=`).
- **Tydzień ISO liczony przez `java.time.temporal.IsoFields`**, nie ręczną arytmetyką na `getDayOfWeek()` — sekcja 9 promptu explicite tego wymaga. `IsoWeek.mondayStart()` buduje datę z kotwicy "4 stycznia zawsze jest w tygodniu 1" (reguła ISO-8601), nie z przesunięć dni, więc tydzień 53 i przełomy roku działają bez specjalnych przypadków w kodzie.
- **Bucketing tygodniowy (dashboard/objętość per grupa mięśniowa) po `workouts.started_at` całej sesji, nie po `sets.completed_at` każdej serii z osobna** — decyzja użytkownika, żeby jeden trening nigdy nie rozjechał się na dwa tygodnie ISO przy sesji kończącej się po północy.
- **Porównania trendu tydzień-do-tygodnia domyślnie pomijają tygodnie/sesje `is_deload`** (deload znika z łańcucha porównań całkowicie — tydzień po deloadzie porównywany do ostatniego tygodnia nie-deload PRZED nim, nie do samego deloadu), **ale `TrendComparator.compareToPreviousWeek(...)` przyjmuje `includeDeload: boolean`** — decyzja użytkownika, że to ma być przełączalne, nie sztywno wykluczone w kodzie.
- **Agregacje SQL/JPQL po stronie Springa (sekcja 9: "nie ściągaj wszystkich serii do serwisu żeby liczyć w pamięci") to osobna sprawa od tego pakietu.** `metrics` dostarcza reguły obliczeniowe (e1RM, PR, bucketing tygodnia) używane PO stronie danych już pobranych do konkretnego raportu/ekranu; agregacja na skalę "cała historia usera" (dashboard, etap 8) ma iść przez `GROUP BY`/`SUM` w zapytaniu repozytorium, nie przez pętlę Javy nad tysiącami rekordów — to dopiero etap 8, tu tylko odnotowane jako zasada na przyszłość.

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
    config/
      SecurityConfig.java        # filter chain, CORS, PasswordEncoder (BCrypt)
      GlobalExceptionHandler.java # BadCredentialsException -> 401, admin/walidacja -> 403/409/400, JSON
      JwtProperties.java         # app.jwt.* (secret/issuer/ttl), @ConfigurationProperties
      CorsProperties.java        # app.cors.allowed-origins
      AdminProperties.java       # app.admin.bootstrap-secret
    user/
      User.java, UserRepository.java
    auth/
      AuthController.java        # POST /api/auth/{login,refresh,logout}
      AuthService.java           # logowanie, rotacja refresh tokenu, logout
      JwtService.java            # generowanie/parsowanie access tokenu (JWT, jjwt)
      JwtAuthenticationFilter.java
      AuthenticatedUser.java     # principal w SecurityContext (userId + login)
      CurrentUser.java           # CurrentUser.id() -- jedyne źródło user_id dla kontrolerów
      TokenHasher.java           # SHA-256 hex, do hashowania refresh tokenów
      RefreshToken.java, RefreshTokenRepository.java
      MeController.java          # GET /api/me -- chroniony smoke-test endpoint
      dto/LoginRequest.java, RefreshRequest.java, TokenPairResponse.java
    admin/
      AdminController.java       # POST /api/admin/users
      AdminUserService.java      # weryfikacja X-Bootstrap-Secret (stałoczasowo) + tworzenie konta
      InvalidBootstrapSecretException.java, UserAlreadyExistsException.java
      dto/CreateUserRequest.java, CreateUserResponse.java
    metrics/                     # czyste funkcje, zero zależności od Springa/JPA -- patrz decyzje etapu 3
      OneRepMaxFormula.java, OneRepMax.java          # e1RM Epley/Brzycki (Brzycki: Optional.empty() dla reps>36)
      RepRangeBucket.java                            # 1 / 2-3 / 4-6 / 7-10 / 11-15 / 15+
      ExerciseSet.java                               # wejście: jedna seria, niezależne od encji JPA
      SessionMetrics.java                            # displayVolumeKg vs prEligibleVolumeKg, heaviestSet
      PersonalRecords.java, PersonalRecordCalculator.java  # compute() i brokenIn() na tym samym algorytmie
      IsoWeek.java                                   # tydzień ISO-8601, Europe/Warsaw, IsoFields (nie ręczna arytmetyka)
      BodyWeightEntry.java, WeeklyBodyWeightAverage.java, BodyWeightAggregator.java
      TrendComparator.java                           # porównanie tydzień-do-tygodnia, includeDeload: boolean
  src/test/java/com/example/easygymbackend/
    EasyGymBackendApplicationTests.java   # smoke test kontekstu Springa (Testcontainers Postgres)
    db/SchemaMigrationTest.java           # weryfikuje migracje: seed = 60, CHECK-i, unikalność
                                           # body_weights per dzień po soft-delete
    auth/AuthControllerTest.java          # login/refresh/logout end-to-end, w tym replay
                                           # starego refresh tokenu i dostęp bez/z tokenem do /api/me
    admin/AdminControllerTest.java        # tworzenie konta, zły/brak sekretu, duplikat loginu,
                                           # walidacja hasła, i że konto realnie działa w /api/auth/login
    metrics/                              # BEZ Springa/Dockera -- czysty JUnit, `./gradlew test --tests
                                           # "com.example.easygymbackend.metrics.*"` starcza, sekundy nie minuty
      OneRepMaxTest.java                  # reps=1, wzory, granica Brzyckiego (36 działa, 37+ Optional.empty())
      RepRangeBucketTest.java             # wszystkie granice zakresów
      SessionMetricsTest.java             # displayVolume vs prEligibleVolume, tie-break najcięższej serii
      PersonalRecordCalculatorTest.java   # PR per kategoria, per zakres, brokenIn (w tym: remis to NIE PR)
      IsoWeekTest.java                    # 2020/W53, przełomy roku 2022->2023 i 2025->2026, DST wiosna/jesień
      BodyWeightAggregatorTest.java       # średnia tygodniowa, niepełny tydzień, delta, krocząca 7-dniowa
      TrendComparatorTest.java            # domyślne pomijanie deload + includeDeload=true
```

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
| `JWT_SECRET` | sekret HMAC do podpisywania access tokenów — **wymagany w produkcji** (min. 32 losowe bajty); developerski default w `application.yaml` jest świadomie słaby i tylko do lokalnej pracy |
| `CORS_ALLOWED_ORIGINS` | dozwolone originy dla frontendu (comma-separated), default `http://localhost:3000` |
| `ADMIN_BOOTSTRAP_SECRET` | sekret do `POST /api/admin/users` — **wymagany w produkcji**, nikomu poza Tobą nieznany; developerski default jest celowo słaby |

### Zakładanie konta

```
curl -X POST localhost:8080/api/admin/users \
  -H "X-Bootstrap-Secret: <ADMIN_BOOTSTRAP_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"login":"Minio","password":"haslo-minio"}'
```

201 z `{id, login, createdAt}` przy sukcesie; 403 przy złym/brakującym sekrecie, 409 przy zajętym loginie, 400 przy haśle krótszym niż 8 znaków. Zero endpointu do listowania/usuwania kont na razie — dwóch userów, ręczne operacje w bazie wystarczą, jeśli kiedyś potrzebne.

## Postęp etapów

Zgodnie z promptem projektowym, realizowanym etapami (nie całość na raz):

- [x] **Etap 1 — schemat bazy.** Flyway V1–V4, seed 60 ćwiczeń, testy integracyjne na Testcontainers.
- [x] **Etap 2 (backend) — szkielet Springa + Auth JWT.** Pakiety `config`/`user`/`auth`/`admin`, login/refresh/logout, rotacja refresh tokenu, `CurrentUser` jako jedyne źródło `user_id`, zakładanie kont przez `POST /api/admin/users` (sekret, nie JWT). Konta `Minio`/`Wojtur` założone i zweryfikowane end-to-end (login, `/api/me`, `./gradlew test --rerun-tasks` zielone: `EasyGymBackendApplicationTests`, `SchemaMigrationTest`, `AuthControllerTest`, `AdminControllerTest`). Po drodze złapane i naprawione dwa realne bugi Spring Boot 4 (brak `spring-boot-starter-flyway`, `@CreationTimestamp` czytany przed flushem) — opisane wyżej. Szkielet Next.js poza zakresem `backend/` — osobny dev/agent.
- [x] **Etap 3 (backend) — pakiet `metrics`.** e1RM (Epley/Brzycki, z guardem na dzielenie przez zero w Brzyckim), objętość (dwie odmiany, display vs PR-eligible), najcięższa seria, PR w 3 kategoriach + per zakres powtórzeń (`compute`/`brokenIn` na jednym algorytmie), tydzień ISO (`IsoFields`, Europe/Warsaw), średnie tygodniowe wagi ciała, porównanie trendu z opcjonalnym pomijaniem deload. 38 testów JUnit, zero zależności od Springa/bazy — realnie odpalone tutaj (`./gradlew test --tests "...metrics.*"`), nie tylko skompilowane. `lib/metrics.ts` po stronie frontu — osobny dev/agent, ten sam etap po ich stronie.
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
