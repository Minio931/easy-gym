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
- Dexie 4 (IndexedDB) — lokalna baza i kolejka synchronizacji; PWA przez `app/manifest.ts` + `public/sw.js`
- Recharts 3 — wykresy (kolory z tokenów CSS, nigdy z literałów w TS)
- Vitest — testy czystych funkcji w `lib/`
- Docelowo (kolejne etapy): ExcelJS

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
   odpowiedzią serwera. Żaden komponent nie woła `lib/api/workouts` bezpośrednio.
   *(Etap 5: przewidywanie „zmieni się wyłącznie ciało `submit()`" sprawdziło się tylko w połowie.
   `submit()` faktycznie wystarczyło, żeby zapis szedł do Dexie — ale usunięcia wymagały jawnych
   tombstone'ów, bo migawka po prostu nie zawiera już skasowanego wiersza, a ścieżka ładowania
   musiała nauczyć się, że 204 z serwera nie znaczy „skasuj trening". Żaden komponent nie wymagał
   zmiany i to akurat się zgadzało.)*

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
    podsumowania bez nazw ćwiczeń. *(Etap 5 tego nie przeniósł do Dexie: „ostatnio używane" to
    preferencja urządzenia, nie dane do synchronizacji, a lista `id`-ków w `localStorage` działa
    offline tak samo dobrze. Do Dexie trafił natomiast sam KATALOG ćwiczeń — patrz etap 5 pkt 11.)*

## Decyzje architektoniczne (etap 5 — Dexie, synchronizacja, PWA)

1. **Jedna baza Dexie na konto** (`easy-gym.<userId>`), nie wspólna z kolumną `userId`. Backend
   pilnuje izolacji filtrem w serwisie i wymusza na to test przy każdym endpoincie, bo zapomniany
   filtr to realny błąd. Tutaj tej pomyłki nie da się popełnić: cudzych danych po prostu nie ma
   w tej bazie.

2. **`dirty: 0 | 1` na wierszu zamiast osobnego dziennika operacji.** Serwer rozstrzyga konflikty
   last-write-wins na CAŁYCH rekordach, więc odtwarzanie dziennika nie dałoby nic poza ryzykiem
   kolejności, a ponowna wysyłka tego samego wiersza jest idempotentna. `0|1`, nie `boolean` —
   **IndexedDB nie indeksuje wartości logicznych**, więc `where("dirty").equals(true)` nigdy nic
   nie zwraca i jest to cichy błąd, nie wyjątek. Ta sama pułapka dotyczy `null`: wiersza
   z `endedAt: null` NIE MA w indeksie `endedAt`, dlatego „trening w toku" filtruje się w pamięci.

3. **REST nie został zastąpiony synchronizacją — obie drogi zostają.** Online zapis leci przez
   REST, bo tylko on oddaje policzone `personalRecordsBrokenIn` i objętości; paczka sync zwraca
   surowe rekordy. Backend projektował te dwie drogi razem (`backend/CLAUDE.md`). Kolejność jest
   sztywna: **najpierw Dexie, potem sieć** (PROMPT §3.5).

4. **Reguła LWW jest ta sama po obu stronach: ściśle `>`, remis wygrywa serwer.** Gdyby klient
   stosował `>=` tam, gdzie serwer stosuje `>`, przy równych znacznikach obie strony uznałyby się
   za zwycięzcę i rekord rozjechałby się między urządzeniami bez żadnego sygnału. Reguły siedzą
   w `lib/sync/merge.ts` jako czyste funkcje z testami, bo to jedyne miejsce synchronizacji,
   w którym błąd jest niewidoczny.

5. **`since` zapisujemy 5 minut przed `serverTime`** (API.md, reguła 8). Drugie urządzenie może
   zatwierdzić transakcję milisekundę później z wcześniejszym `updatedAt`; bez cofnięcia ten zapis
   nie trafiłby do żadnego kolejnego zaciągu. Koszt: kilka rekordów przysyłanych ponownie — to samo
   `id` i `updatedAt`, więc bez skutku.

6. **`dirty` zdejmujemy tylko z wierszy, których `updatedAt` nie zmienił się od wysłania.** Seria
   poprawiona w trakcie lotu żądania musi zostać brudna, inaczej zostałaby uznana za zapisaną
   i nigdy by nie dojechała.

7. **204 z `/api/workouts/active` nie czyści już ekranu bezwarunkowo.** Trening rozpoczęty bez
   zasięgu istnieje tylko lokalnie — serwer o nim nie wie i nie ma prawa go skasować. Stary kod
   wyrzuciłby w tym miejscu całą sesję z siłowni.

8. **Zakończenie treningu działa offline.** `endedAt` ląduje w Dexie z `dirty = 1`, a podsumowanie
   pokazuje wszystko poza plakietkami rekordów — `personalRecordsBrokenIn` zależy od całej historii
   ćwiczenia. Lepiej pokazać rekordy z opóźnieniem niż zgadnąć i po chwili zabrać.

9. **Wylogowanie najpierw wypycha zaległości, a bazę kasuje tylko przy pustej kolejce.**
   Bezwarunkowe kasowanie wyrzuciłoby do kosza trening zrobiony bez zasięgu. Migawkę
   w `localStorage` czyścimy zawsze — to ona jest widoczna od razu dla następnej osoby.

10. **`localStorage` ZOSTAJE obok Dexie jako cache ekranu.** Jest synchroniczny, więc wznowiony
    trening jest pełny w pierwszej klatce, zanim wróci asynchroniczny odczyt z IndexedDB. Obie
    kopie zapisuje `commit()` z tego samego `state.workout`, więc nie mają jak się rozjechać.

11. **Wyszukiwarka ćwiczeń schodzi na lokalny katalog przy `OfflineError`** (i tylko przy nim —
    4xx/5xx ma dojść jako błąd). Bez tego offline dawało się zacząć trening, ale nie dodać do niego
    ćwiczenia. Lokalne szukanie to zwykłe „zawiera" bez ogonków, świadomie gorsze niż `pg_trgm`
    na serwerze.

12. **Service worker cache'uje WYŁĄCZNIE powłokę** (HTML tras, chunki, fonty, ikony); `/api/*`
    i `/actuator/*` są jawnie wykluczone. Cache odpowiedzi API byłby drugą, niewidoczną kopią
    danych, która nie zna `updatedAt` ani `deletedAt`. Jedna warstwa offline na dane, nie dwie.
    **Rejestracja tylko w buildzie produkcyjnym** — w `next dev` nazwy chunków zmieniają się przy
    każdym zapisie i SW potrafi podać stary chunk do nowego HTML-a (biała strona „naprawiana"
    czyszczeniem danych witryny). Konsekwencja: e2e sprawdzają offline na poziomie Dexie, nie SW.

## Decyzje architektoniczne (etap 6 — historia i ekran ćwiczenia)

1. **Historia to lista PODSUMOWAŃ, nie sesji.** Objętość oraz liczby serii i ćwiczeń liczy baza
   w `GROUP BY` (PROMPT §9). Wejście w wiersz otwiera istniejący ekran podsumowania — drugiego
   ekranu pokazującego to samo nie budujemy, bo byłby drugą rzeczą do utrzymania w zgodzie.

2. **Paginacja doklejana po `id`, nie po indeksie.** Trening zakończony między stronami przesunąłby
   offset o jeden i zdublował wiersz.

3. **Kolory wykresów wyłącznie jako tokeny CSS** (`var(--series-N)` z `app/globals.css`). Hexy
   w TS byłyby drugą paletą, rozjeżdżającą się z pierwszą przy pierwszej korekcie — i wykresem
   w jasnym motywie z kolorami ciemnego.

4. **Paleta NIE zapętla się na 9. serii.** Kolejność slotów to zabezpieczenie dla daltonizmu
   (DESIGN §3.4), a dziewiąta seria w kolorze pierwszej to dwie serie nie do odróżnienia.
   `seriesColor()` oddaje wtedy `--ink-3` — czytelny sygnał „tego nie da się już rozróżnić kolorem".

5. **Rozmiar punktu na wykresie ciężaru skaluje POLE koła, nie promień.** Oko czyta powierzchnię;
   promień liniowy w liczbie powtórzeń kazałby czytać „10 powtórzeń" jako ponad trzykrotnie większy
   wysiłek niż „3 powtórzenia".

6. **Sesja bez wartości nie daje punktu — nie daje zera.** Trening z samych rozgrzewek ma
   `heaviestSet: null`, a zero na wykresie ciężaru wyglądałoby jak załamanie formy, którego nie było.
   Wyjątkiem jest objętość: tam zero JEST prawdziwą wartością.

7. **Oś X jest liczbowa (ms), nie kategorialna.** Oś kategorialna rysuje miesiąc przerwy tak samo
   jak dzień i kłamie o tempie progresu.

8. **Jeden przełącznik zakresu na cały ekran**, mimo że pigułki — zgodnie z DESIGN §7.6 — siedzą
   w każdym kaflu. Trzy niezależne zakresy dałyby trzy wykresy różnych okresów obok siebie.

9. **Tabela pod wykresem to tryb dostępny I sposób odczytania liczby bez celowania w punkt**
   (DESIGN §10). Kafel ma `aria-label` — bez niego jest nienazwanym regionem, a słowo „Ciężar"
   występuje na ekranie dwa razy (tytuł kafla i kafelek rekordu).

10. **Moment wczytania trzymany razem z danymi**, nie jako `new Date()` w `useMemo`. Inaczej
    „teraz" jest liczone poza zależnościami hooka i trzy wykresy mogą dostać trzy różne chwile.

Trzy defekty wyszły dopiero z patrzenia na wyrenderowany ekran, nie z lektury kodu: ujemny margines
lewy ucinał etykiety osi Y (ucięte „108 kg" → „08 kg" nadal czyta się jak dane), słupki wystawały
poza domenę i siadały na etykietach osi, a skracanie tylko dużych wartości do ton dawało oś,
na której „1,6 t" sąsiaduje z „800" — dwie jednostki na jednej skali.

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
      cwiczenie/[id]/page.tsx # ekran ćwiczenia (wejście z podsumowania treningu)
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
    db/
      schema.ts               # tabele Dexie = rekordy paczki sync + flaga `dirty`
      database.ts             # cykl życia bazy per konto, `since`, kasowanie przy wylogowaniu
      workout-repository.ts   # WorkoutDetailResponse <-> wiersze; tombstone'y
      exercise-repository.ts  # katalog ćwiczeń + szukanie lokalne (zapas offline)
    sync/
      merge.ts                # reguły LWW jako czyste funkcje (+ 11 testów)
      merge.test.ts
      engine.ts               # zbierz brudne -> POST /api/sync -> zastosuj; stan dla pigułki
      use-sync.ts             # useSyncState() dla UI
    exercise/catalog.ts       # findExercises(): serwer, a bez sieci lokalny katalog
    exercise/history.ts       # historia ćwiczenia -> punkty wykresów (+ testy)
    charts.ts                 # zakresy czasu, sloty palety, skala punktu (+ testy)
    api/sync.ts               # POST /api/sync
    workout/
      store.ts                # JEDYNE miejsce zapisu treningu (stan + kolejka + Dexie + migawka)
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
  components/charts/          # kafel wykresu (zakres + tabela) i wykresy ćwiczenia
  components/history/         # lista historii treningów
  components/exercise/        # ekran pojedynczego ćwiczenia: rekordy + 3 wykresy
  app/manifest.ts             # manifest PWA (generowany przez Next, nie plik w public/)
  public/sw.js                # service worker: TYLKO powłoka, zero cache'owania API
  public/icons/               # ikony PWA (generuje design/generate-icons.py)
  types/api.ts                # kontrakt z backendem
  types/sync.ts               # kontrakt paczki POST /api/sync (mirror SyncRecords.java)
  e2e/10-offline-sync.spec.ts # cała sesja offline -> serwer po powrocie sieci
  e2e/11-history-and-exercise.spec.ts # historia, wejście w sesję i ćwiczenie, zakres i tabela
  design/canvas/              # artboardy płótna projektowego (poza buildem apki)
  design/generate-icons.py    # generator ikon PWA (trzymany razem z wynikiem)
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
npm run test:e2e    # playwright -- wymaga ZYWEGO backendu i frontu (patrz nizej)
```

E2E potrzebują trzech rzeczy naraz: backendu (`PLAYWRIGHT_API_URL`, domyślnie `:8081`), frontu
pod `:3001` (`npm run dev -- -p 3001`) i **obu kont** (`Minio`, `Wojtur`) w bazie tego backendu.
Backend musi też dopuszczać `http://localhost:3001` w `CORS_ALLOWED_ORIGINS` — inaczej wszystkie
żądania z testów lecą w preflight 403, co wygląda jak błąd apki, a jest konfiguracją.

**Service workera te testy nie dotykają** (chodzą po `next dev`, gdzie rejestracja jest wyłączona).
Powłokę offline sprawdza się ręcznie: `npm run build && npm start`, DevTools → Application →
Service Workers, potem Network → Offline i twarde przeładowanie.

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
- [x] **Etap 5 — Dexie + kolejka sync + PWA.** Lokalna baza per konto (tabele = rekordy paczki
  `POST /api/sync`, flaga `dirty` zamiast dziennika operacji), silnik synchronizacji (push
  brudnych wierszy + pull, LWW ściśle `>`, `since` z marginesem 5 min), zapis treningu najpierw do
  Dexie i dopiero potem do API, zakończenie treningu offline, wyszukiwarka ćwiczeń z zapasem
  w lokalnym katalogu, kasowanie bazy przy wylogowaniu (dopiero po opróżnieniu kolejki),
  licznik zaległości w pigułce, manifest + service worker + ikony (instalowalna na Androidzie).
  Kontrakt sync był już gotowy w `backend/API.md` — notatka „wymaga uzgodnienia" była nieaktualna.
  Odpalone tutaj: `lint`, `typecheck`, `vitest` (96 testów), `build`, `playwright` (68 testów,
  oba profile) — zielone. PWA zweryfikowana na realnym `next build && next start`: SW rejestruje
  się, precache'uje 6 tras powłoki + 13 zasobów, twarde przeładowanie bez sieci renderuje apkę
  z własnymi fontami i React się hydratuje, a żądanie do API nie jest podawane z cache.
  Przy okazji złapane i naprawione trzy realne błędy — patrz commity `fix(frontend)`.
- [x] **Etap 6 — historia treningów i ekran ćwiczenia z wykresami.** Lista historii z paginacją
  („Pokaż starsze"), wejście w sesję przez istniejące podsumowanie i dalej w ćwiczenie, ekran
  `/cwiczenie/[id]` z rekordami i trzema wykresami (ciężar z punktem skalowanym powtórzeniami,
  e1RM, objętość sesji), przełącznik zakresu 1M/3M/6M/1R/Całość i tabela pod każdym wykresem.
  Odpalone tutaj: `lint`, `typecheck`, `vitest` (118 testów), `build`, `playwright` (72 testy,
  oba profile) — zielone; ekrany obejrzane na żywym backendzie przy 390 px na koncie z realną
  progresją z czterech miesięcy (stąd trzy poprawki osi opisane wyżej).
- [ ] Etap 7 — moduł wagi ciała.
- [ ] Etap 8 — dashboard (agregaty liczy backend, nie przeglądarka).
- [ ] Etap 9 — eksport XLSX (najpierw decyzja: ExcelJS na froncie vs Apache POI w Springu — `PROMPT.md` §7).

## Konwencje

- **Zero literałów kolorów w komponentach.** Każdy kolor przez token (`bg-surface`, `text-ink-3`, `border-hairline`). Kolory statusu, które nie mają utility Tailwinda, przez `style={{ color: "var(--critical)" }}` — nadal token, nie hex.
- **Zero zapytań `fetch` poza `lib/api/`.** Komponent, który sam woła `fetch`, omija refresh tokenu i wyloguje użytkownika przy pierwszym wygaśnięciu.
- Logika obliczeniowa wyłącznie w `lib/metrics.ts`, jako czyste funkcje z testami. Komponenty liczą tylko układ.
- Ciężkie agregacje (dashboard, cała historia) robi backend zapytaniem `GROUP BY`/`SUM`. `lib/metrics.ts` liczy na danych już pobranych pod konkretny ekran.
- Każda zmiana kształtu żądania/odpowiedzi API jest **zmianą kontraktu** z backendem — zgłaszana wprost, nie obchodzona adapterem w kliencie.
