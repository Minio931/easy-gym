# Prompt: easy-gym — część FRONTEND (PWA)

> Wyciąg z oryginalnego promptu projektowego (`prompt-apka-silownia.md`), ograniczony do zakresu `frontend/`.
> Backend (Spring Boot + Postgres) żyje w `../backend/` i jest realizowany przez osobną sesję/agenta — nie modyfikuj go stąd.
> Realizuj etapy z sekcji 11 pojedynczo, nie całą apkę w jednej odpowiedzi.

---

Jesteś doświadczonym front-end developerem. Budujemy PWA do śledzenia treningu siłowego i masy ciała. Pracujemy etapami — w każdej odpowiedzi realizujesz tylko ten etap, o który proszę, i dajesz kompletny, działający kod (bez placeholderów typu `// TODO: implement`).

## 0. WAŻNE: odstępstwo od oryginalnego promptu — nie ma Supabase

Oryginalny prompt zakładał **Supabase (Postgres + Auth + RLS)** jako backend. **Ta decyzja została zmieniona** — backend to własny **Spring Boot 4 + Postgres + Flyway**, z własnym JWT auth. Konsekwencje dla frontu:

- **Zero `@supabase/supabase-js`**, zero `createClient`, zero zapytań PostgREST z przeglądarki. Front rozmawia wyłącznie z REST API Springa (`NEXT_PUBLIC_API_URL`, lokalnie `http://localhost:8080`).
- **Zero RLS jako mechanizmu bezpieczeństwa po stronie klienta.** Izolacja danych per-user jest robiona w warstwie serwisowej Springa, na podstawie `user_id` z JWT. Front **nigdy** nie wysyła `user_id` w body/query — serwer i tak bierze je z tokenu i zignoruje to, co przyśle klient.
- **Brak self-service rejestracji i resetu hasła.** Dwóch znanych użytkowników, konta zakładane endpointem admina z sekretem. Front ma ekran logowania i nic więcej — żadnego „Zarejestruj się", żadnego „Nie pamiętam hasła".
- Auth: `POST /api/auth/login` → para tokenów (access JWT 15 min + opaque refresh 30 dni). Refresh token jest **rotowany** przy każdym `/api/auth/refresh` — stary natychmiast przestaje działać, więc równoległe odświeżanie z dwóch zakładek/requestów musi być zserializowane (jeden in-flight refresh, reszta czeka na jego wynik), inaczej wylogujesz usera sam sobie.

## 1. Stack

- **Framework:** Next.js (App Router) + TypeScript (strict, bez `any`) + Tailwind CSS
- **Wykresy:** Recharts
- **Dane:** REST API Spring Boot (`../backend/`), JWT w nagłówku `Authorization: Bearer <accessToken>`
- **Offline-first:** Dexie (IndexedDB) jako lokalny cache + kolejka synchronizacji. Siłownia często nie ma zasięgu — apka musi w pełni działać offline i zsynchronizować się po odzyskaniu połączenia (last-write-wins po `updated_at`, **każdy rekord ma UUID generowany po stronie klienta**)
- **PWA:** manifest + service worker, instalowalna na Androidzie, działa jak natywna
- **Eksport XLSX:** ExcelJS (decyzja o kształcie eksportu — patrz sekcja 7)
- **Testy:** Vitest (logika w `lib/`), opcjonalnie Playwright na E2E

Jeśli uważasz, że któryś wybór jest zły — powiedz to i zaproponuj alternatywę, zanim zaczniesz kodować.

## 2. Model danych (kontrakt z backendem)

Schemat Postgresa jest już wdrożony po stronie backendu (Flyway `V1`–`V4`). Front odwzorowuje go w typach TS i w schemacie Dexie:

```
profiles          id (=users.id), display_name, unit ('kg'), created_at
exercises         id, user_id (NULL = globalne), name, muscle_group,
                  equipment ('barbell'|'dumbbell'|'machine'|'cable'|'bodyweight'|'other'),
                  is_archived, created_at, updated_at, deleted_at
routines          id, user_id, name, notes                      -- szablony treningów
routine_items     id, routine_id, exercise_id, order_index, target_sets, target_reps
workouts          id, user_id, started_at, ended_at, routine_id (NULL), notes, is_deload
workout_exercises id, workout_id, exercise_id, order_index, notes
sets              id, workout_exercise_id, set_index, weight_kg (numeric 6,2),
                  reps (int), rpe (numeric 3,1, NULL), is_warmup (bool),
                  to_failure (bool), assisted (bool), completed_at, updated_at
body_weights      id, user_id, measured_on (date, jeden ŻYWY wpis na dzień), weight_kg, note
```

Reguły, które front musi respektować, bo baza je egzekwuje `CHECK`-ami i zwróci błąd:

- **Wszystkie tabele synchronizowane z klienta mają `id UUID` generowany po stronie klienta** (baza nie ma `DEFAULT` na PK), `updated_at` (klucz do LWW) i `deleted_at` (soft delete / tombstone). **Usunięcie to nigdy `DELETE`, tylko ustawienie `deleted_at` + bump `updated_at`** — inaczej skasowanie offline nie zsynchronizuje się na drugie urządzenie.
- `sets`: `weight_kg` 0–500, `reps` 1–100, `rpe` 1–10 lub `null`.
- `body_weights`: jeden żywy wpis na `(user_id, measured_on)`. Ponowny wpis tego samego dnia = edycja istniejącego, nie insert.
- `exercises.user_id IS NULL` = ćwiczenie globalne z seeda (60 pozycji po polsku, grupy mięśniowe po polsku: `klatka piersiowa`, `plecy`, ...). Widoczne dla każdego konta, **nieedytowalne i nieusuwalne przez usera** — własne ćwiczenia user dodaje jako nowe rekordy z własnym `user_id`.
- Pola `to_failure`, `assisted` (w `sets`) i `is_deload` (w `workouts`) są rozszerzeniem względem oryginalnego promptu — są w schemacie i wpływają na metryki (patrz sekcja 4), więc UI musi je udostępniać.

## 3. Przebieg treningu (najważniejszy ekran — projektuj go pod kciuk, jedną ręką, w hali)

1. „Rozpocznij trening" → pusty trening albo z szablonu (routine)
2. Dodaj ćwiczenie → wyszukiwarka z fuzzy search + sekcja „ostatnio używane"
3. Dla każdego ćwiczenia: lista serii z polami **ciężar** i **powtórzenia**
   - inputy `inputMode="decimal"` → od razu klawiatura numeryczna
   - przyciski szybkiej zmiany: `−2.5 / +2.5 kg` i `−1 / +1 powt.`
   - **przy każdej serii wyświetl szarym tekstem wynik z poprzedniego treningu tego ćwiczenia** (np. „ostatnio: 100 × 5") jako punkt odniesienia
   - przycisk „skopiuj poprzednią serię"
   - checkbox „rozgrzewkowa" (serie rozgrzewkowe wykluczone z PR, e1RM i objętości)
   - swipe / long-press → usuń serię (soft delete!)
4. **Timer przerwy** startuje automatycznie po zatwierdzeniu serii (domyślnie 2:00, konfigurowalny per ćwiczenie), z powiadomieniem
5. Autozapis po każdej zmianie — zamknięcie przeglądarki nie może skasować treningu. Zapis idzie **najpierw do Dexie**, dopiero potem do API (patrz etap 5)
6. „Zakończ trening" → podsumowanie: czas trwania, łączna objętość, lista pobitych PR z tej sesji

## 4. Metryki progresu — `lib/metrics.ts` (mirror backendu, te same reguły)

Backend ma już gotowy pakiet `metrics` (Java, 38 testów JUnit) — `lib/metrics.ts` ma być jego **dokładnym odpowiednikiem**. Rozjazd reguł = front pokaże inny PR niż eksport XLSX z serwera. Kanoniczne reguły, w tym te, które nie wynikają wprost z prostej lektury promptu:

- **e1RM wg Epleya:** `weight × (1 + reps / 30)`; dla `reps = 1` → `weight`. Funkcja `estimate1RM(weight, reps, formula)` z opcją Brzyckiego: `weight × 36 / (37 − reps)`. Wzór wybierany w ustawieniach użytkownika.
- **Brzycki dzieli przez zero przy `reps = 37`** i zwraca ujemne bzdury powyżej (realne przy `bodyweight` + `to_failure`, np. 40 pompek). Backend zwraca w tym wypadku `Optional.empty()` — front ma zwracać `null`, **nigdy** liczby.
- **e1RM i PR liczone zawsze na żywo, nigdy cache'owane w bazie/Dexie** — formuła jest wyborem usera w ustawieniach; zapisany e1RM zafałszowałby historię po zmianie formuły.
- **Dwie różne objętości sesji, nie jedna:**
  - `displayVolumeKg` — do pokazania userowi: `Σ (weight × reps)` z serii roboczych, **wliczając `assisted`** (praca fizycznie wykonana),
  - `prEligibleVolumeKg` — do PR „największa objętość w sesji": to samo, ale **`assisted` wykluczone**.
  Dwie nazwane funkcje, żeby nie dało się pomylić po cichu. Rozgrzewka wykluczona w obu.
- **Najcięższa seria w sesji:** max `weight` wśród serii roboczych nie-`assisted`, przy remisie ta z większą liczbą powtórzeń.
- **PR w trzech kategoriach:** najwyższy ciężar, najwyższy e1RM, największa objętość w jednej sesji — wszystkie z wykluczeniem rozgrzewki i `assisted`. Dodatkowo **PR per zakres powtórzeń** (`1`, `2–3`, `4–6`, `7–10`, `11–15`, `15+`).
- **„PR pobity w tej sesji" ≠ „to jest globalne maksimum".** Potrzebne są dwie funkcje na tym samym algorytmie: stan aktualnych rekordów oraz „które rekordy pobiła ostatnia sesja w momencie jej wykonania" (baner w podsumowaniu treningu i kolumna „czy PR" w eksporcie). **Remis to NIE pobicie rekordu** (ściśle `>`, nie `>=`).
- **Objętość tygodniowa per grupa mięśniowa bucketowana po `workouts.started_at` całej sesji**, nie po `completed_at` pojedynczych serii — sesja kończąca się po północy nie może rozjechać się na dwa tygodnie ISO.
- **Progresja ciężaru z kontekstem powtórzeń:** wykres ciężaru najcięższej serii w czasie, gdzie **każdy punkt jest opisany liczbą powtórzeń** (label/tooltip: `102.5 kg × 5 @RPE 8`), rozmiar punktu skalowany liczbą powtórzeń. To ma być główny wykres ćwiczenia — 100 kg × 3 i 100 kg × 8 to nie jest ten sam wynik i wykres musi to pokazywać.

## 5. Waga ciała i średnie tygodniowe

- Szybkie wpisanie wagi (jeden wpis na dzień, edytowalny)
- **Średnia tygodniowa: tydzień ISO-8601, poniedziałek → niedziela**, liczona w strefie `Europe/Warsaw`. Użyj `date-fns` z `weekStartsOn: 1` (`startOfWeek`, `getISOWeek`) — **nigdy natywnego `getDay()` bez korekty**. Backend liczy to przez `java.time.temporal.IsoFields`; granice muszą się zgadzać co do dnia (tydzień 53, przełom roku, DST).
- Tydzień z mniej niż 2 pomiarami oznacz jako niepełny (pokaż, ale wizualnie wyróżnij)
- Pokaż: deltę tydzień do tygodnia (kg i %), średnią kroczącą 7-dniową, trend 4-tygodniowy
- **Porównania trendu domyślnie pomijają tygodnie/sesje `is_deload`** (tydzień po deloadzie porównywany do ostatniego tygodnia nie-deload PRZED nim, nie do samego deloadu), ale ma to być **przełączalne** (`includeDeload`), nie zaszyte na sztywno
- Wykres: surowe pomiary dzienne jako jasne punkty + linia średnich tygodniowych jako gruba linia na wierzchu

## 6. Wykresy (Recharts)

- Ekran ćwiczenia: progresja ciężaru z opisem powtórzeń (główny), e1RM w czasie, objętość na sesję
- Ekran wagi: pomiary + średnie tygodniowe
- Dashboard: objętość tygodniowa per grupa mięśniowa (stacked bar), liczba treningów w miesiącu (heatmapa/kalendarz), ostatnie PR
- Wszędzie: przełącznik zakresu 1M / 3M / 6M / 1R / całość, dark mode, czytelność na ekranie ~390 px szerokości

## 7. Eksport do Excela (ExcelJS)

Jeden plik `.xlsx`, arkusze:

1. **Podsumowanie** — zakres dat, liczba treningów, łączna objętość, lista PR, waga start/koniec/zmiana
2. **Treningi** — data, dzień tygodnia, czas trwania, ćwiczenia, liczba serii, objętość
3. **Serie** — płaska tabela: data, ćwiczenie, grupa mięśniowa, nr serii, ciężar, powtórzenia, RPE, objętość, e1RM, czy rozgrzewkowa, czy PR. Arkusz źródłowy pod tabele przestawne — jeden wiersz = jedna seria, żadnych scalanych komórek.
4. **Progres ćwiczeń** — per ćwiczenie: pierwszy wynik, ostatni wynik, najlepszy ciężar, najlepszy e1RM, przyrost w kg i %
5. **Waga ciała** — data, waga, średnia krocząca 7 dni
6. **Waga tygodniowo** — rok, nr tygodnia ISO, zakres dat (pon–niedz), liczba pomiarów, średnia, delta kg, delta %

Formatowanie każdego arkusza: nagłówek pogrubiony, biała czcionka na ciemnym tle, zamrożony (`views: [{ state: 'frozen', ySplit: 1 }]`); `autoFilter` na nagłówkach; szerokości kolumn dobrane do treści; formaty liczbowe — daty `dd.mm.yyyy`, ciężar `0.00 "kg"`, procenty `0.0%`; wiersze z PR podświetlone tłem; ujemne delty na czerwono, dodatnie na zielono; nazwane zakresy dla arkusza „Serie" pod tabelę przestawną.

Filtr eksportu: zakres dat, wybrane ćwiczenia, opcja „tylko serie robocze".

**Uwaga:** ExcelJS nie tworzy natywnych wykresów Excela. Zanim zaczniesz ten etap, przedstaw trzy opcje (dane + gotowe tabele przestawne / wykresy jako obrazki PNG wklejone do arkusza / generowanie pliku po stronie serwera) z wadami każdej i poczekaj na decyzję. **Dodatkowa opcja doszła wraz ze zmianą backendu:** generowanie XLSX po stronie Springa przez Apache POI (etap 9 backendu) — wtedy front tylko pobiera plik z endpointu. Uwzględnij ją w porównaniu.

## 8. UX i zasady

- Mobile-first, dark mode domyślnie, duże pola dotykowe (min. 44 px)
- Zero migających spinnerów przy zapisie — optymistyczny UI, zapis w tle
- Zaokrąglanie ciężaru do 0.25 kg, walidacja: ciężar 0–500, powtórzenia 1–100 (te same granice co `CHECK` w bazie)
- Kalkulator talerzy (jakie krążki założyć dla danego ciężaru przy gryfie 20 kg) — miły dodatek, nie priorytet
- Polski interfejs

## 9. Wymagania techniczne

- TypeScript strict, bez `any`
- Logika obliczeniowa (e1RM, objętość, PR, agregacja tygodniowa) w **czystych funkcjach w `lib/metrics.ts`**, pokryta testami jednostkowymi (Vitest) — szczególnie granice tygodnia: niedziela 23:59, poniedziałek 00:00, przełom roku, tydzień 53
- **Ciężkie agregacje (dashboard, cała historia usera) robi backend** zapytaniem `GROUP BY`/`SUM`, nie front pętlą po tysiącach serii ściągniętych do przeglądarki. `lib/metrics.ts` liczy na danych już pobranych pod konkretny ekran (aktywny trening, jedno ćwiczenie, podsumowanie sesji) — tam gdzie i tak są w pamięci
- **Pieniądze za precyzję:** `weight_kg` to `numeric(6,2)` po stronie bazy. W TS uważaj na float — zaokrąglaj do 2 miejsc przy porównaniach PR, inaczej `102.5` z API i `102.50000000000001` z lokalnego obliczenia dadzą fałszywy „nowy rekord"
- Czytelna struktura katalogów, komponenty krótkie i jednoodpowiedzialne

## 10. Kontrakt API (stan na dziś)

Base URL: `NEXT_PUBLIC_API_URL` (dev: `http://localhost:8080`). CORS po stronie backendu dopuszcza `http://localhost:3000` (`CORS_ALLOWED_ORIGINS`), dozwolone nagłówki: `Authorization`, `Content-Type`.

**Zaimplementowane i przetestowane end-to-end:**

| Metoda | Ścieżka | Body / nagłówki | Odpowiedź |
|---|---|---|---|
| `POST` | `/api/auth/login` | `{"login": string, "password": string}` | `200 {"accessToken", "refreshToken", "expiresInSeconds"}` |
| `POST` | `/api/auth/refresh` | `{"refreshToken": string}` | `200` — jak wyżej, **z nowym refresh tokenem (rotacja)** |
| `POST` | `/api/auth/logout` | `{"refreshToken": string}` | `204` |
| `GET` | `/api/me` | `Authorization: Bearer <access>` | `200 {"userId": uuid, "login": string}` |
| `POST` | `/api/admin/users` | `X-Bootstrap-Secret: <sekret>` + `{"login","password"}` | `201 {"id","login","createdAt"}` — **operacja administracyjna, front tego nie woła** |

Błędy: zawsze JSON `{"error": "..."}`. `401` — złe dane logowania / brak lub nieważny access token (wtedy: spróbuj refresh, przy jego porażce wyloguj), `400` — błąd walidacji, `403` — zły sekret admina, `409` — konflikt (np. zajęty login).

**Jeszcze NIE istnieje** (powstanie w kolejnych etapach backendu — dopóki go nie ma, front pracuje na Dexie i mockach): CRUD ćwiczeń/rutyn/treningów/serii, endpoint wagi ciała, endpoint synchronizacji Dexie, agregacje pod dashboard, eksport XLSX. **Kształt tych endpointów jest do uzgodnienia z sesją backendową — nie zakładaj go po cichu.** Endpoint synchronizacji jest zaprojektowany od początku jako część API (etap 5 po obu stronach), a nie dolepiany później; jego kontrakt (kształt paczki push/pull, rozstrzyganie konfliktów LWW, tombstone'y) ustalcie wspólnie **przed** implementacją.

Do lokalnego developmentu: backend uruchamiasz `cd ../backend && docker compose up -d && ./gradlew bootRun`; konta (`Minio`, `Wojtur`) są już założone w lokalnej bazie.

## 11. Etapy (front)

1. ~~Schemat bazy~~ — zrobione po stronie backendu (Flyway V1–V4, seed 60 ćwiczeń). Front tylko odwzorowuje typy.
2. Szkielet projektu Next.js, konfiguracja klienta API, auth (login, przechowywanie i odświeżanie tokenów, guard tras), layout i nawigacja
3. `lib/metrics.ts` + testy jednostkowe (Vitest) — mirror pakietu `metrics` z backendu, patrz sekcja 4
4. **Ekran aktywnego treningu (serce apki — poświęć na to najwięcej uwagi)**
5. Warstwa offline: Dexie + kolejka synchronizacji + PWA (wymaga uzgodnienia endpointu sync z backendem)
6. Historia treningów i ekran pojedynczego ćwiczenia z wykresami
7. Moduł wagi ciała + średnie tygodniowe + wykres
8. Dashboard
9. Eksport XLSX

## 12. Format odpowiedzi

- Pełne pliki z podaniem ścieżki, nie fragmenty „wstaw to gdzieś tutaj"
- Na końcu każdego etapu: co dokładnie zrobić ręcznie (zmienne środowiskowe, konfiguracja) i jak sprawdzić, że etap działa
- Jeśli coś w wymaganiach jest sprzeczne, niejasne albo po prostu głupie — powiedz to wprost, zamiast zgadywać
- **Każda zmiana kształtu żądania/odpowiedzi API jest zmianą kontraktu z backendem** — zgłoś ją wprost, nie obchodź jej po cichu adapterem w kliencie
