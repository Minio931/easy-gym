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
- **`spring.jpa.open-in-view: false` (celowo ustawione) + `@ManyToOne(fetch = LAZY)` = każda metoda serwisu, która nawiguje po leniwej relacji (np. `workoutExercise.getExercise().getName()`), MUSI być `@Transactional(readOnly = true)`.** Bez tego sesja Hibernate zamyka się zaraz po repozytorium, a dostęp do leniwego pola wywala `LazyInitializationException` -- złapane realnie testem integracyjnym (`WorkoutFlowTest`), nie na oko. Domyślny wariant "OSIV=true" (Spring Boot default) by to ukrył kosztem trzymania połączenia z bazą otwartego przez cały czas renderowania odpowiedzi -- świadomie tego unikamy.
- **Sterownik JDBC Postgresa nie umie wywnioskować typu SQL dla gołego `java.time.Instant` w `NamedParameterJdbcTemplate`/`JdbcTemplate` (surowy JDBC, nie JPA/Hibernate -- ten ma własny type system i działa bez problemu).** `PSQLException: Can't infer the SQL type to use for an instance of java.time.Instant`. Konwertuj na `java.sql.Timestamp.from(instant)` przed `.addValue(...)`. Dotyczy tylko surowego SQL (np. `SyncService`), nie zwykłych encji JPA.
- **`WHERE (:param IS NULL OR kolumna > :param)` w JPQL wybucha `could not determine data type of parameter $N`, gdy `:param` faktycznie jest null.** Postgresowy extended query protocol nie ma z czego wywnioskować typu dla gołego `? IS NULL` bez kontekstu kolumny (mimo że TEN SAM parametr w drugiej połowie OR ma typ jasny z porównania). Fix: nie przekazuj null -- zamień na sentinel (`Instant.EPOCH` dla "od zawsze") PRZED wywołaniem repozytorium i usuń gałąź `IS NULL` z JPQL całkowicie (patrz `SyncService.pull`, `findChangedSince` we wszystkich repo pakietu `workout`).

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

### Decyzje architektoniczne (fundament backendowy pod etap 4 — pakiet `workout`)

Etap 4 z promptu to front (ekran aktywnego treningu). Backendowa część zrobiona wcześniej jako fundament, na wyraźną prośbę — realne encje JPA + CRUD pod `exercises`/`workouts`/`workout_exercises`/`sets`, żeby front miał na czym stanąć zamiast czekać na osobny etap. `routines`/`routine_items`/`body_weights` **celowo pominięte** (poza zakresem tego, o co poproszono) — dojdą przy właściwych etapach (6/7).

- **Encja `WorkoutSet`, nie `Set`.** Tabela to `sets`, ale `java.util.Set` to nazwa zarezerwowana dla kolekcji w każdym pliku Javy — kolizja nazw byłaby myląca przy każdym imporcie.
- **`Equipment` jako enum + `AttributeConverter`, nie `@Enumerated(STRING)`.** DB (CHECK + seed z V4) ma wartości lowercase (`'barbell'`), a `@Enumerated(STRING)` zapisałoby dokładną nazwę stałej Javy (`"BARBELL"`) — złamałoby to zgodność z już wsianymi 60 ćwiczeniami. Converter robi `name().toLowerCase()` w jedną stronę i `valueOf(upperCase)` w drugą.
- **Izolacja `user_id` tranzytywna przez JOIN, nie osobna kolumna na każdej tabeli.** `workout_exercises` i `sets` nie mają własnego `user_id` (bo go w ogóle nie ma w schemacie z sekcji 2) — każde zapytanie repozytorium (`findVisibleTo`) filtruje przez JPQL JOIN aż do `workout.userId`. Sprawdzone testem na każdym szczeblu łańcucha osobno (`WorkoutFlowTest`), nie tylko na najgłębszym.
- **404, nie 403, dla cudzych zasobów.** `ResourceNotFoundException` używany identycznie gdy zasób nie istnieje i gdy istnieje ale należy do innego usera — nie zdradzamy przez kod odpowiedzi, że cudze dane w ogóle są.
- **Soft delete wszędzie zgodnie z konwencją z migracji** — `DELETE /api/sets/{id}` ustawia `deleted_at`, nie robi `DELETE FROM`. Sprawdzone testem że rekord znika z odpowiedzi API, ale zostaje w bazie (`WorkoutFlowTest#usunietaSeriaZnikaZOdpowiedziAleZostajeWBazieJakoSoftDelete`).
- **`@CreationTimestamp`/`@UpdateTimestamp` (serwer sam bije `updated_at`) to rozwiązanie TYMCZASOWE, nie docelowe pod sync.** Etap 5 (Dexie + endpoint synchronizacji) zakłada że to KLIENT generuje `updated_at` (offline-first LWW) i serwer musi je PRZYJĄĆ, nie nadpisać własnym zegarem. Zwykłe REST-owe CRUD z tego etapu (bez sync) nadal mogą używać auto-timestampów Hibernate — ale endpoint sync z etapu 5 będzie potrzebował innej ścieżki zapisu (prawdopodobnie natywny SQL/JPQL UPDATE z jawnym `updated_at` z requestu, omijający te adnotacje). Nie przeoczyć tego przy etapie 5.
- **Zaokrąglanie ciężaru do 0.25 kg (sekcja 8 promptu) NIE jest jeszcze wymuszone po stronie backendu.** Tylko zakres 0–500 (DB CHECK + Bean Validation). Świadomie odłożone — front i tak ma to wymusić przez przyciski +/-2.5, a dodanie custom Bean Validation constraintu teraz to zgadywanie UX zanim front go zdefiniuje.
- **Poprawka po fakcie: `id` we wszystkich `Create*`/`Add*Request` musi być generowany przez KLIENTA, nie przez serwer.** Pierwsza wersja `ExerciseService`/`WorkoutService`/`SetService` generowała `UUID.randomUUID()` po stronie Springa — sprzeczne z własną konwencją z migracji V3 ("id UUID -- generowany po stronie klienta") i z całą architekturą offline-first (offline trening potrzebuje id natychmiast, bez roundtripu). Naprawione zanim backend poszedł dalej (etap sync i tak by tego wymagał) — `id` jest teraz wymaganym polem w `CreateExerciseRequest`/`StartWorkoutRequest`/`AddExerciseRequest`/`AddSetRequest`. Duplikat `id` (np. retry offline) na razie kończy się 409 (`DataIntegrityViolationException` z UNIQUE na PK, złapane globalnym handlerem) — idempotentny upsert dla retry to zadanie endpointu sync, nie zwykłego CRUD.

### Decyzje architektoniczne (etap 5 — endpoint sync)

`POST /api/sync` (push + pull w jednym round-tripie) i `GET /api/sync?since=` (pull-only, np. świeża instalacja). Scope: `exercises` (własne usera, nie globalne -- klient ich nie tworzy), `workouts`, `workout_exercises`, `sets`, `body_weights` (dopisane w etapie 7). `routines`/`routine_items` wciąż nie istnieją jako encje -- dojdą do sync gdy powstaną (żaden etap z promptu jeszcze ich nie wymagał wprost).

- **Upsert po surowym SQL (`NamedParameterJdbcTemplate`), nie przez encje JPA.** `@CreationTimestamp`/`@UpdateTimestamp` na encjach z `workout` zawsze nadpisałyby `updated_at` zegarem serwera -- tu MUSI wygrać wartość od klienta, bo to jest cały sens LWW offline-first. `INSERT ... ON CONFLICT (id) DO UPDATE ... WHERE tabela.updated_at < EXCLUDED.updated_at` robi atomowy upsert-z-LWW w jednym statemencie -- starsza przychodząca wersja po prostu nie dopasowuje się do WHERE i Postgres nic nie robi (żadnego SELECT-then-branch w Javie).
- **Cały batch pada (400), jeśli którykolwiek rekord dotyka danych innego usera -- decyzja użytkownika, nie cichy skip pojedynczego rekordu.** Walidacja własności (bezpośrednia przez id ORAZ przez referencje `workoutId`/`exerciseId`/`workoutExerciseId` dla nowych rekordów) w jednej metodzie, PRZED jakimkolwiek zapisem. `@Transactional` na `push()` gwarantuje że nic się nie zapisze, jeśli walidacja padnie w trakcie -- sprawdzone testem, który odpytuje bazę bezpośrednio po 400, nie tylko sprawdza kod odpowiedzi.
- **Referencje "w dół" (nowy `workout_exercise` wskazujący na nowy `workout` w TYM SAMYM batchu) muszą działać** -- to jest dokładnie jak offline sync będzie używany w praktyce: cała sesja treningowa (trening + ćwiczenia + serie) zsynchronizowana za jednym razem po odzyskaniu zasięgu. Walidacja sprawdza najpierw zbiór id z własnego batcha, dopiero potem odpytuje bazę dla referencji spoza batcha.
- **Global exercises (`user_id IS NULL`) nigdy nie są celem sync push** -- id z seeda V4 trafiające w batch traktowane jak "cudze" (właściciel `NULL` ≠ current user), więc każda próba nadpisania globalnego ćwiczenia przez sync też odrzuca cały batch.

### Decyzje architektoniczne (etap 6 — historia + ekran ćwiczenia)

Historia treningów (lista) już istniała z fundamentu pod etap 4 (`GET /api/workouts`) — nic nowego tu nie trzeba było dobudowywać. Nowość etapu 6: `GET /api/exercises/{id}/progress` — **pierwsze realne wpięcie pakietu `metrics` (etap 3) w dane z bazy**, nie tylko syntetyczne dane testowe.

- **Pobranie wszystkich serii jednego ćwiczenia i policzenie w Javie (pakiet `metrics`), nie SQL `GROUP BY`.** Świadomie inaczej niż sekcja 9 promptu każe dla dashboardu (etap 8) -- tam agregacja "cała historia wszystkich ćwiczeń" faktycznie powinna iść przez `SUM`/`GROUP BY` w zapytaniu. Tu zakres jest z natury mały (jedno ćwiczenie, jeden user), więc ściągnięcie serii i odpalenie już przetestowanych czystych funkcji (`SessionMetrics.heaviestSet`, `OneRepMax.estimate`, `PersonalRecordCalculator.compute`) jest właściwym narzędziem -- i jest to dokładnie po to te funkcje istniały w izolacji od Springa/JPA od etapu 3.
- **Grupowanie serii po sesji (workout) robi serwis, nie zapytanie.** Jedna seria = jeden wiersz `sets`, ale wykres z sekcji 4 chce jeden punkt na SESJĘ (najcięższa seria tej sesji). `ExerciseProgressService` grupuje po `workout_id` w pamięci (`LinkedHashMap` zachowuje kolejność chronologiczną z `ORDER BY` w zapytaniu).
- **Formuła e1RM (Epley/Brzycki) na razie przez `?formula=` query param, default `EPLEY`, nie zapisany profil usera.** `profiles` istnieje w schemacie, ale nie ma jeszcze encji/endpointu ustawień -- dodanie tego to osobna, mała sprawa, nie blokuje etapu 6. Nie zapominać dopisać, jeśli/kiedy powstanie moduł ustawień.
- **Sesje bez żadnej serii roboczej (same rozgrzewkowe) znikają z wykresu całkowicie**, nie pojawiają się jako punkt "brak danych" -- `SessionMetrics.heaviestSet` zwraca `Optional.empty()`, punkt jest wtedy pomijany (`flatMap(Optional::stream)`).
- **Izolacja dla globalnych ćwiczeń jest przez dane, nie przez 404.** Ćwiczenie globalne jest widoczne dla obu userów (samo `Exercise` istnieje), ale zapytanie o serie filtruje po `workout.userId` -- user B pytający o progres globalnego ćwiczenia, którego nigdy nie trenował, dostaje `200` z pustą listą punktów, nie błąd. Dla ćwiczeń WŁASNYCH innego usera (custom, `user_id` ustawiony) `findVisibleTo` już wcześniej zwraca 404 -- sprawdzone testem.

### Decyzje architektoniczne (etap 7 — waga ciała)

Pakiet `bodyweight`: `BodyWeight` (encja, tabela `body_weights` -- UWAGA, brak `created_at`, tylko `measured_on`/`updated_at`/`deleted_at`), CRUD (`POST`/`PATCH`/`DELETE /api/body-weights`) + `GET /api/body-weights` zwracający naraz surowe wpisy, krocząca średnia 7-dniowa i średnie tygodniowe z deltami -- drugie (po etapie 6) wpięcie pakietu `metrics` (`BodyWeightAggregator`) w realne dane.

- **"Jeden wpis na dzień, edytowalny" (sekcja 5 promptu) egzekwowane samą bazą (częściowy unikalny indeks z V3), nie specjalną logiką upsert w serwisie.** POST zawsze tworzy nowy wiersz (spójne z resztą architektury -- id klienta, jak wszędzie); druga próba na ten sam dzień innym id obija się o indeks i dostaje zwykłe 409 z już istniejącego globalnego handlera (`DataIntegrityViolationException`). Edycja dnia = PATCH pod tym samym id, nie ponowny POST -- `measuredOn` celowo niemodyfikowalny przez PATCH (zmiana dnia to nowy wpis, nie przesunięcie).
- **Rozszerzony sync o `body_weights` od razu, nie "później".** `CLAUDE.md` z etapu 5 już zapowiadało że sync dojdzie do tej tabeli gdy encja powstanie -- zrobione tutaj, żeby nie zostawiać rozjazdu między dokumentacją a stanem kodu.
- **Znane, świadomie nierozwiązane ograniczenie sync dla `body_weights`:** `ON CONFLICT (id)` w upsercie chroni tylko przed konfliktem na PK, nie na częściowym unikalnym indeksie `(user_id, measured_on)`. Dwa urządzenia offline tworzące NIEZALEŻNE nowe wpisy (różne id) na ten sam dzień -- rzadkie, ale możliwe -- skończą się zwykłym 409 przy sync, nie eleganckim rozwiązaniem przez LWW. Naprawa wymagałaby wykrywania kolizji dnia i scalania rekordów po stronie `SyncService`, nie tylko po id -- świadomie odłożone, udokumentowane w kodzie (`SyncService.upsertBodyWeight`), nie przemilczane.

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
    workout/                     # fundament pod etap 4 (front) -- exercises/workouts/sets, BEZ routines/body_weights
      Equipment.java, EquipmentConverter.java        # enum <-> lowercase DB value, zgodne z CHECK i seedem V4
      Exercise.java, ExerciseRepository.java, ExerciseService.java, ExerciseController.java
      Workout.java, WorkoutRepository.java
      WorkoutExercise.java, WorkoutExerciseRepository.java
      WorkoutSet.java, WorkoutSetRepository.java     # UWAGA: tabela "sets" nie ma created_at, tylko completed_at
      WorkoutService.java          # start/update(=zakończ)/getDetail/list/addExercise, izolacja przez JOIN
      SetService.java              # add/update/delete (soft), izolacja tranzytywna set->workout_exercise->workout
      WorkoutController.java, SetController.java
      WorkoutMapper.java           # jedno miejsce mapowania encja->DTO, używane przez oba serwisy
      ResourceNotFoundException.java  # 404 zarówno dla "nie istnieje" jak i "cudze" -- celowo bez rozróżnienia
      dto/StartWorkoutRequest.java, UpdateWorkoutRequest.java, WorkoutSummaryResponse.java, WorkoutDetailResponse.java,
          AddExerciseRequest.java, WorkoutExerciseResponse.java, AddSetRequest.java, UpdateSetRequest.java,
          SetResponse.java, CreateExerciseRequest.java, ExerciseResponse.java
      ExerciseProgressService.java  # etap 6 -- pierwsze wpięcie metrics w realne dane, grupowanie po sesji
      dto/ExerciseProgressResponse.java, ExerciseProgressPoint.java, PersonalRecordsResponse.java,
          PersonalRecordEntryResponse.java, SessionVolumeRecordResponse.java
    bodyweight/                  # etap 7 -- CRUD wagi ciała + drugie wpięcie metrics (BodyWeightAggregator)
      BodyWeight.java, BodyWeightRepository.java   # UWAGA: brak created_at, tylko measured_on/updated_at/deleted_at
      BodyWeightService.java, BodyWeightController.java
      dto/CreateBodyWeightRequest.java, UpdateBodyWeightRequest.java, BodyWeightResponse.java,
          WeeklyAverageResponse.java, BodyWeightProgressResponse.java
    sync/                        # etap 5 -- POST /api/sync (push+pull), GET /api/sync?since= (pull-only)
      SyncService.java             # upsert LWW po surowym SQL (NIE przez encje -- @UpdateTimestamp by nadpisał
                                    # updated_at klienta), walidacja własności PRZED zapisem, cały batch albo nic
      SyncOwnershipViolationException.java  # -> 400, cały batch odrzucony
      SyncController.java
      dto/ExerciseSyncRecord.java, WorkoutSyncRecord.java, WorkoutExerciseSyncRecord.java, SetSyncRecord.java,
          BodyWeightSyncRecord.java, SyncBatch.java, SyncPushRequest.java, SyncPullResponse.java
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
    workout/WorkoutFlowTest.java          # pełny przepływ (start->exercise->set->koniec) + izolacja user A/B
                                           # na KAŻDYM szczeblu (workout, dodanie ćwiczenia, dodanie serii,
                                           # edycja/usunięcie serii), soft-delete, walidacja zakresów
    workout/ExerciseProgressTest.java     # metrics na prawdziwych danych: rozgrzewka/assisted faktycznie
                                           # wykluczone, chronologia punktów, PR z wielu sesji, Epley != Brzycki,
                                           # izolacja globalnego ćwiczenia przez dane (200+puste), 404 dla cudzego
    bodyweight/BodyWeightFlowTest.java    # jeden wpis/dzień (409 na duplikat), edycja, soft-delete, średnia
                                           # tygodniowa + niepełny tydzień, walidacja zakresu, izolacja user A/B
    sync/SyncFlowTest.java                # cała sesja w jednym batchu, LWW (starsza/nowsza aktualizacja),
                                           # tombstone, since-filtering, konflikt własności odrzuca CAŁY
                                           # batch i NIC się nie zapisuje (sprawdzone zapytaniem do bazy,
                                           # nie tylko kodem 400), cross-device convergence
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
- [x] **Etap 4 (backend, fundament -- na życzenie, przed frontem) — pakiet `workout`.** Realne encje JPA + CRUD: `exercises` (global + własne, wyszukiwanie), `workouts` (start/koniec/deload/lista), `workout_exercises`, `sets` (dodanie/edycja/soft-delete). Izolacja `user_id` tranzytywna przez JOIN na KAŻDYM szczeblu, pokryta testem (`WorkoutFlowTest`, 11 scenariuszy) -- w tym realny bug złapany testem integracyjnym: `getDetail()` bez `@Transactional(readOnly=true)` + `open-in-view=false` + leniwa relacja = `LazyInitializationException`, nie widać tego bez Testcontainers. **68/68 testów zielonych w całym projekcie**, realnie odpalone (`./gradlew test --rerun-tasks`), Docker był dostępny w tej sesji. `routines`/`routine_items`/`body_weights` świadomie pominięte -- poza zakresem tego, o co poproszono, wracają przy etapach 6/7. Ekran aktywnego treningu (front) — osobny dev/agent, wciąż otwarte.
- [x] **Etap 5 (backend) — endpoint sync.** `POST /api/sync` (push+pull) + `GET /api/sync?since=` (pull-only). Upsert-z-LWW po surowym SQL (`ON CONFLICT ... WHERE updated_at < EXCLUDED.updated_at`), walidacja własności PRZED zapisem (bezpośrednia + przez referencje, w tym referencje do rekordów z TEGO SAMEGO batcha), cały batch pada (400) przy konflikcie — decyzja użytkownika. Scope pierwotnie: `exercises`/`workouts`/`workout_exercises`/`sets`; `body_weights` dopisane w etapie 7. `SyncFlowTest`, 7 scenariuszy. Po drodze złapane i naprawione dwa kolejne realne buggi Postgres/JDBC (opisane w sekcji "Stack" wyżej): brak type inference dla gołego `Instant` w surowym SQL, i dla `:param IS NULL` gdy param faktycznie null. **75/75 testów w całym projekcie, realnie odpalone.** `SyncFlowTest` pokrywa już oba scenariusze konfliktowe z sekcji 9 promptu na poziomie backendu (starsza aktualizacja ignorowana, dwa "urządzenia" tego samego usera się zbiegają) — ale to nie zastępuje pełnego planu testowania Dexie+PWA po stronie frontu, tylko potwierdza że serwerowa połowa kontraktu (LWW, atomowość batcha) faktycznie działa. Dexie + PWA + service worker (front) — otwarte, poza mną.
- [x] **Etap 6 (backend) — `GET /api/exercises/{id}/progress`.** Pierwsze wpięcie pakietu `metrics` w realne dane: grupowanie serii po sesji, `heaviestSet`/`OneRepMax`/`PersonalRecordCalculator` na danych z bazy, nie syntetycznych. Historia treningów (lista) już gotowa z fundamentu etapu 4 (`GET /api/workouts`). `ExerciseProgressTest`, 7 scenariuszy — w tym potwierdzone na prawdziwych danych, że rozgrzewka/assisted faktycznie znikają z wykresu, nie tylko w testach jednostkowych `metrics`. **82/82 testów w całym projekcie.** Ekran z wykresami (Recharts, front) — otwarte, poza mną.
- [x] **Etap 7 (backend) — moduł wagi ciała.** `BodyWeight` encja + CRUD (`POST`/`PATCH`/`DELETE /api/body-weights`), `GET /api/body-weights` zwraca surowe wpisy + krocząca 7-dniowa + średnie tygodniowe z deltami -- drugie wpięcie `metrics` (`BodyWeightAggregator`) w realne dane. "Jeden wpis na dzień" egzekwowany samą bazą (częściowy unikalny indeks), nie logiką serwisu. Sync rozszerzony o `body_weights` (zgodnie z zapowiedzią z etapu 5) -- ze znanym, udokumentowanym ograniczeniem: kolizja dnia między dwoma NOWYMI id z różnych urządzeń offline kończy się 409, nie eleganckim LWW. `BodyWeightFlowTest`, 9 scenariuszy. **91/91 testów w całym projekcie, realnie odpalone.** Wykres (front) — otwarte, poza mną.
- [ ] Etap 8 — dashboard (agregacje w Springu).
- [ ] Etap 9 — eksport XLSX (Apache POI).

## Konwencje

- Migracje Flyway: nigdy nie edytuj już zastosowanej migracji (`V1`...`V4` po merge do main) — nowa zmiana schematu to zawsze kolejny numer (`V5__...`).
- Każdy endpoint operujący na danych per-user filtruje po `user_id` z JWT w warstwie serwisowej — bez wyjątków (patrz decyzja 2 wyżej). Test "izolacja user A / user B" jest obowiązkowy przy każdym takim endponcie.
- Agregacje (sumy objętości, średnie tygodniowe, PR) liczone SQL/JPQL po stronie Springa, nie ściąganiem wszystkich wierszy do pamięci serwisu (sekcja 9 promptu).
