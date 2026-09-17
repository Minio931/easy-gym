@AGENTS.md

# easy-gym-frontend

Next.js PWA do śledzenia treningu siłowego i masy ciała. Rozmawia wyłącznie z REST API Spring Boota z `../backend/` — zero Supabase, zero zapytań do bazy z przeglądarki.

Dokumenty obok tego pliku:
- `PROMPT.md` — prompt projektowy (zakres frontu), kontrakt API, lista etapów.
- `DESIGN.md` — system projektowy: kolor, typografia, komponenty, reguły wykresów. Źródło prawdy dla wyglądu.
- `AGENTS.md` — generowane przez Next 16 przy każdym `next dev`/`next build`. **Nie pisz tam własnych notatek**, zostaną nadpisane.
- `design/canvas/*.dc.html` — artboardy płótna projektowego (ekrany 390×844 + arkusz systemu), z których składany jest podgląd designu. Źródła zostają w repo, złożony plik `.html` jest w `.gitignore`.

## Stack

- Next.js 16.3 (App Router, Turbopack) + React 19.2 + TypeScript strict (bez `any`)
- Tailwind CSS v4 — konfiguracja w CSS (`app/globals.css`), **bez `tailwind.config.js`**
- `next/font/google`: Archivo (zmienny, oś `wdth`) + Public Sans, oba z `latin-ext` (polska diakrytyka)
- `date-fns` 4 + `@date-fns/tz` — tydzień ISO i strefa `Europe/Warsaw`
- Vitest — testy czystych funkcji w `lib/`
- Docelowo (kolejne etapy): Dexie (offline + kolejka sync), Recharts, ExcelJS

**Pułapki Next 16 / React 19 w tym projekcie:**
- `eslint-config-next` włącza regułę `react-hooks/set-state-in-effect` — **`useState` + `useEffect` do czytania `localStorage` jest błędem lintu, nie stylem**. Stan zewnętrzny (sesja, ustawienia) czytamy przez `useSyncExternalStore`, a migawka musi być cache'owana w module (zwracanie nowego obiektu przy każdym wywołaniu = pętla renderów).
- Hydracja: serwer nie zna `localStorage`, więc w pierwszym renderze sesja zawsze wygląda na pustą. Stąd `useIsHydrated()` (`lib/use-is-hydrated.ts`) i trzeci stan `loading` w `useAuth()` — bez tego guard tras wyrzuca zalogowanego użytkownika na `/logowanie` przy każdym odświeżeniu strony.
- Next sam generuje `AGENTS.md` i `CLAUDE.md` przy starcie dev/build. Ten plik zaczyna się od `@AGENTS.md` właśnie po to, żeby zachować import wygenerowanych reguł.

## Decyzje architektoniczne (etap 2 — szkielet, auth, nawigacja)

1. **Tokeny w `localStorage`, nie w cookie `httpOnly`.** Backend oddaje parę tokenów w body, a apka ma działać offline jako PWA — token i tak musi być dostępny w JS. Koszt: podatność na XSS. Ograniczamy go tym, że nigdzie nie wstrzykujemy HTML-a z danych i nie ładujemy skryptów z zewnątrz. Gdyby kiedyś doszedł cookie-based flow, zmienia się `lib/auth/token-store.ts` i nic poza nim.

2. **Odświeżanie tokenu jest zserializowane na dwóch poziomach.** Backend rotuje refresh token przy każdym `/api/auth/refresh` — stary natychmiast umiera. Dwa równoległe odświeżenia = drugie dostaje 401 i wylogowuje użytkownika w połowie serii. Bariery: (a) jeden in-flight refresh w obrębie zakładki, (b) `navigator.locks` między zakładkami — kto wejdzie drugi, zastaje w `localStorage` nową parę i jej używa zamiast odświeżać ponownie. Pokryte testem `lib/api/client.test.ts` („odświeża token dokładnie raz przy równoległych żądaniach").

3. **Offline nigdy nie wylogowuje.** `OfflineError` (fetch odrzucony bez odpowiedzi) jest osobną klasą od `ApiError` i przechodzi przez logikę refreshu bez czyszczenia sesji. Refresh token żyje 30 dni, a brak zasięgu na siłowni to stan normalny, nie awaria (DESIGN.md §7.4). Sesję kasuje **wyłącznie** 401 na samym refreshu.

4. **Guard tras tylko po stronie klienta** (`components/shell/require-auth.tsx`). Serwer Next.js nie wie, kto pyta (patrz decyzja 1), a realną bramką jest backend, który odrzuca każde żądanie bez ważnego JWT. Guard pilnuje wyłącznie tego, żeby nie mignął pusty ekran apki przed przekierowaniem.

5. **Tokeny designu przeniesione do `app/globals.css`; `design/tokens.css` usunięty.** Dwie kopie tej samej palety rozjeżdżają się przy pierwszej korekcie koloru. `DESIGN.md` pozostaje opisem, `globals.css` jedyną implementacją.

6. **Ustawienia (motyw, wzór e1RM, domyślna przerwa) trzymane lokalnie**, nie w bazie — backend nie ma jeszcze endpointu profilu, a motyw jest per-urządzenie. Wzór e1RM przeniesie się na serwer, gdy taki endpoint powstanie. Motyw aplikuje mikroskopijny skrypt synchroniczny w `app/layout.tsx`, bo inaczej użytkownik jasnego motywu dostaje mignięcie czerni przy każdym wejściu.

## Decyzje architektoniczne (etap 3 — `lib/metrics.ts`)

`lib/metrics.ts` to **mirror pakietu `metrics` z backendu** (`../backend/src/main/java/com/example/easygymbackend/metrics/`). Te same reguły, te same granice. Rozjazd = front pokaże inny PR niż eksport XLSX z serwera, więc zmiana reguły po jednej stronie wymaga tej samej zmiany po drugiej.

Rzeczy specyficzne dla TS, których nie ma w wersji Javy:

- **`round2()` zamiast `BigDecimal`.** Java liczy na `BigDecimal` z `RoundingMode.HALF_UP`; TS ma double. `Math.round(x * 100) / 100` zawodzi dwukrotnie: mnożenie gubi precyzję (`1.005 * 100 = 100.49999999999999`) i połówki idą w stronę `+∞`, nie od zera (`-0.5 → -0`, Java dałaby `-1`). Dlatego przecinek przesuwamy po wykładniku (`toExponential`), a znak obsługujemy jawnie. Bez tego `102.5` z API i `102.50000000000001` z lokalnej sumy dają fałszywy „nowy rekord".
- **Tydzień ISO: `date-fns` dla dat, `TZDate` tylko dla momentów.** Numer tygodnia zależy od dnia kalendarzowego, nie od strefy — funkcje operujące na `YYYY-MM-DD` budują `Date` z gotowych y/m/d (godzina 12:00, żeby żadna zmiana czasu nie przesunęła doby) i są niezależne od strefy hosta. Strefa `Europe/Warsaw` wchodzi w grę **tylko** przy zamianie momentu (`workouts.started_at`) na dzień kalendarzowy — `warsawCalendarDate()`. Testy przechodzą pod `TZ=America/Los_Angeles` i `TZ=Asia/Tokyo` (sprawdzone, nie założone).
- **`null` zamiast `Optional.empty()`** — e1RM Brzyckiego dla reps > 36, delty bez poprzedniego tygodnia, brak najcięższej serii.

## Decyzje architektoniczne (etap 4 — ekran aktywnego treningu)

1. **Jedno miejsce zapisu: `lib/workout/store.ts`.** Każda zmiana treningu idzie tą samą drogą:
   łatka optymistyczna na lokalnej migawce → zapis migawki do `localStorage` → zadanie w
   szeregowej kolejce (`lib/workout/mutation-queue.ts`), które woła API i podmienia migawkę
   odpowiedzią serwera. Żaden komponent nie woła `lib/api/workouts` bezpośrednio. W etapie 5
   zmienia się **wyłącznie ciało `submit()`** (Dexie + trwała kolejka sync) i `persistence.ts`.

2. **Kolejka jest szeregowa (FIFO, jedno zadanie naraz), a odpowiedź serwera podmienia stan tylko
   wtedy, gdy nic więcej nie czeka.** Backend oddaje cały `WorkoutDetailResponse` z każdej
   operacji, więc odpowiedź na serię nr 2 cofnęłaby na ekranie serię nr 3 zatwierdzoną sekundę
   później. Ostatnia odpowiedź w serii i tak zawiera komplet.

3. **Ponawianie tylko błędów przejściowych** (brak sieci, 5xx, 408, 429), 3 próby, backoff 1/3/9 s.
   `400`/`404` nie naprawią się od powtórzenia, a zapętlone retry zablokowałoby kolejkę. Powrót
   sieci (`online`) ponawia zaległe zapisy sam, bez klikania „Ponów".

4. **Rekordy (PR) liczy wyłącznie serwer.** `personalRecordsBrokenIn` zależy od całej historii
   ćwiczenia, której przeglądarka w trakcie sesji nie ma. Lokalny podgląd dawałby migającą
   plakietkę „PR", która po sekundzie znika. `lib/metrics.ts` liczy tu tylko objętości i licznik
   serii roboczych (`lib/workout/optimistic.ts`) — te same reguły co backend, więc bez rozjazdu.

5. **W `localStorage` ląduje tylko to, co user zatwierdził.** Niezatwierdzony szkic serii (w tym
   wiersz wstępnie wypełniony po ✓) ginie przy zamknięciu karty — wskrzeszony po dwóch dniach
   udawałby serię, której nikt nie zrobił. Migawka jest przypisana do `userId` i kasowana przy
   wylogowaniu (cudzy trening nie może zostać na urządzeniu).

6. **Timer przerwy żyje w module (`lib/workout/rest-timer.ts`), nie w komponencie karty** —
   przetrwa nawigację między zakładkami i jest widoczny z każdego ekranu. Odliczanie liczy się
   z `endsAt` (timestamp absolutny) i przelicza po `visibilitychange`; wygaszony ekran zatrzymuje
   `setInterval`, ale nie zegar. To samo dotyczy czasu trwania sesji (`lib/use-now.ts`).

7. **Przerwane żądanie ≠ brak sieci.** `lib/api/client.ts` zamieniał każde odrzucenie `fetch`
   na `OfflineError`, także przerwanie przez `AbortController`. W trybie ścisłym React uruchamia
   efekt dwa razy (mount → cleanup → mount), więc pierwszy fetch **zawsze** jest przerywany —
   ekran podsumowania przez to zostawał w stanie błędu mimo udanego drugiego żądania. Abort jest
   teraz przepuszczany w oryginalnej postaci (`isAbortError` w `lib/api/errors.ts`).

8. **Arkusze renderują się portalem do `<body>` i ustawiają `inert` + `aria-hidden` na `#app-root`.**
   Bez tego Tab i czytnik ekranu wchodzą pod arkusz, a „Zakończ" w arkuszu i „Zakończ trening"
   pod spodem są jednocześnie osiągalne — czyli modal, który niczego nie zasłania.

9. **Stopień pisma liczby w aktywnym wierszu skaluje się jednostką `cqi`** (szerokość tacy, nie
   okna): 40 px `num-hero` tam, gdzie się mieści, 32 px przy 390 px, 19 px przy 320 px. Sztywne
   40 px przy 390 px ucinałoby „102.5" w polu wyrównanym do prawej, czyli pokazywałoby **zły
   ciężar**, nie ucięty tekst. Dolna granica nie schodzi poniżej 16 px (próg auto-zoomu iOS).

10. **„Ostatnio używane" i czas przerwy per ćwiczenie siedzą w `localStorage`**, bo backend nie ma
    `GET /api/exercises/recent` ani endpointu preferencji, a `GET /api/workouts` zwraca
    podsumowania bez nazw ćwiczeń. W etapie 5 zastąpi to zapytanie do Dexie.

## Struktura

```
frontend/
  app/
    globals.css               # tokeny + @theme inline + klasy .num-* -- jedyne źródło kolorów
    layout.tsx                # fonty, AuthProvider, skrypt motywu przed pierwszym malowaniem
    page.tsx                  # "/" -> /pulpit
    logowanie/page.tsx        # jedyny ekran auth (bez rejestracji i resetu hasła)
    (app)/
      layout.tsx              # RequireAuth + AppShell
      pulpit|trening|historia|waga|ustawienia/page.tsx
  components/
    shell/                    # app-bar, tab-bar, sync-pill, app-shell, require-auth
    ui/                       # button, screen (Screen/SectionLabel/EmptyState/Skeleton), icons
  lib/
    api/client.ts             # JEDYNE wejście do API: bearer, refresh, single-flight + Web Locks
    api/auth.ts               # login / logout / me
    api/errors.ts             # ApiError, OfflineError, messageForUser
    auth/token-store.ts       # localStorage + cache + storage event (sklep dla useSyncExternalStore)
    auth/auth-context.tsx     # useAuth(): status, user, signIn, signOut
    metrics.ts                # mirror pakietu metrics z backendu
    metrics.test.ts           # 40 testów -- mirror testów JUnit
    api/client.test.ts        # 6 testów -- rotacja refresh tokenu, offline, 401
    settings.ts               # motyw / wzór e1RM / domyślna przerwa
    use-is-hydrated.ts
    use-now.ts                # wspólny zegar sekundowy (czas sesji) -- jeden interval na apkę
    use-online.ts             # stan sieci przez useSyncExternalStore
    format.ts                 # czas, objętość, polska odmiana przez liczebnik (+ testy)
    workout/
      store.ts                # JEDYNE miejsce zapisu treningu (stan + kolejka + migawka)
      mutation-queue.ts       # szeregowa kolejka zapisów, retry 1/3/9 s
      optimistic.ts           # czyste łatki na WorkoutDetailResponse (+ testy)
      set-values.ts           # parsowanie/granice/walidacja pól serii (+ testy)
      reference.ts            # linijka "ostatnio: 100 x 5", znaczniki, PR (+ testy)
      draft.ts                # szkic wiersza serii (przed zatwierdzeniem)
      persistence.ts          # migawka aktywnego treningu w localStorage
      rest-timer.ts           # timer przerwy (endsAt absolutny, poza drzewem ekranu)
      rest-preferences.ts     # czas przerwy per cwiczenie + dzwiek
      rest-signals.ts         # WebAudio / wibracja / powiadomienie systemowe
      recent-exercises.ts     # "ostatnio uzywane" w localStorage
      uuid.ts
  components/workout/         # ekran treningu: karta, wiersze serii, arkusze, timer, podsumowanie
  types/api.ts                # kontrakt z backendem
  design/canvas/              # artboardy płótna projektowego (poza buildem apki)
```

## Jak uruchomić lokalnie

1. Backend: `cd ../backend && docker compose up -d && ./gradlew bootRun` (wymaga JDK 26 — toolchain z `build.gradle.kts`).
2. `cp .env.example .env.local` — `NEXT_PUBLIC_API_URL=http://localhost:8080`.
3. `npm install && npm run dev` → `http://localhost:3000`.
4. Logowanie kontem założonym przez `POST /api/admin/users` (`Minio` / `Wojtur` są już w lokalnej bazie backendu).

## Jak sprawdzić, że nie zepsułeś

```
npm run test        # vitest, czyste funkcje -- sekundy, bez sieci i bez backendu
npm run typecheck   # tsc --noEmit
npm run lint        # eslint (flat config)
npm run build       # next build -- pobiera fonty z Google, wymaga sieci
```

## Postęp etapów (numeracja z `PROMPT.md` §11)

- [x] **Etap 1 — schemat bazy.** Zrobiony po stronie backendu; front odwzorowuje typy.
- [x] **Etap 2 — szkielet Next.js, klient API, auth, layout i nawigacja.** Logowanie, przechowywanie i rotacja tokenów, guard tras, dolna belka (Pulpit/Trening/Historia/Waga), ekran ustawień (motyw, wzór e1RM, wylogowanie), pigułka offline. Odpalone tutaj: `npm run build`, `lint`, `typecheck`, `vitest` (46 testów) — zielone. **Nie zweryfikowane end-to-end z żywym backendem** (w tej sesji brak JDK 26 i port 5432 zajęty przez inny projekt) — logowanie przez prawdziwe API trzeba kliknąć ręcznie, patrz „Jak uruchomić lokalnie".
- [x] **Etap 3 — `lib/metrics.ts` + testy.** Mirror pakietu `metrics` z backendu: e1RM (Epley/Brzycki z `null` powyżej 36 powtórzeń), dwie objętości sesji, najcięższa seria, PR w 3 kategoriach + per zakres powtórzeń, `computePersonalRecords`/`personalRecordsBrokenIn` na jednym algorytmie, tydzień ISO, średnie tygodniowe wagi, trend z `includeDeload`. 40 testów mirrorujących JUnit.
- [x] **Etap 4 — ekran aktywnego treningu.** Start pusty/z szablonu (`applyRoutine`), wznowienie
  przez `GET /api/workouts/active` (bez pytania „czy wznowić?"), wyszukiwarka ćwiczeń
  (fuzzy po stronie bazy + „ostatnio używane" z `localStorage` + dodanie własnego ćwiczenia),
  wiersz serii ze stepperami i autorepeatem, znacznikami (RPE / do upadku / z asystą /
  rozgrzewka), referencją z poprzedniego treningu, miękkim usuwaniem (swipe / long-press /
  pigułka) z „Cofnij", timer przerwy odporny na uśpienie ekranu, autozapis optymistyczny przez
  jedną kolejkę, zakończenie + podsumowanie z `personalRecordsBrokenIn`. Odpalone tutaj:
  `lint`, `typecheck`, `vitest` (85 testów), `build` — zielone; ekran przeklikany na żywym
  backendzie (:8081) kontem `Minio` przy 320 / 390 / 430 px, w obu motywach.
- [ ] Etap 5 — Dexie + kolejka sync + PWA (**wymaga uzgodnienia kontraktu endpointu sync z sesją backendową przed kodowaniem**).
- [ ] Etap 6 — historia treningów i ekran ćwiczenia z wykresami.
- [ ] Etap 7 — moduł wagi ciała.
- [ ] Etap 8 — dashboard (agregaty liczy backend, nie przeglądarka).
- [ ] Etap 9 — eksport XLSX (najpierw decyzja: ExcelJS na froncie vs Apache POI w Springu — `PROMPT.md` §7).

## Konwencje

- **Zero literałów kolorów w komponentach.** Każdy kolor przez token (`bg-surface`, `text-ink-3`, `border-hairline`). Kolory statusu, które nie mają utility Tailwinda, przez `style={{ color: "var(--critical)" }}` — nadal token, nie hex.
- **Zero zapytań `fetch` poza `lib/api/`.** Komponent, który sam woła `fetch`, omija refresh tokenu i wyloguje użytkownika przy pierwszym wygaśnięciu.
- Logika obliczeniowa wyłącznie w `lib/metrics.ts`, jako czyste funkcje z testami. Komponenty liczą tylko układ.
- Ciężkie agregacje (dashboard, cała historia) robi backend zapytaniem `GROUP BY`/`SUM`. `lib/metrics.ts` liczy na danych już pobranych pod konkretny ekran.
- Każda zmiana kształtu żądania/odpowiedzi API jest **zmianą kontraktu** z backendem — zgłaszana wprost, nie obchodzona adapterem w kliencie.
