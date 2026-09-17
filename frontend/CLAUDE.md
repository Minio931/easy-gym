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

## Decyzje architektoniczne (etap 7 — waga ciała)

1. **Wpis jest upsertem po DNIU po obu stronach.** Serwer ma częściowy indeks unikalny na
   `(user_id, measured_on)`, więc lokalny zapis też szuka wiersza z tą datą i go nadpisuje.
   Tworzenie nowego wiersza przy każdej poprawce wysłałoby dwa wpisy z tego samego dnia w paczce
   sync; serwer rozstrzygnąłby to tombstone'em, a użytkownik zobaczyłby, jak jego poprawka znika.

2. **Ekran mówi wprost, że zapis nadpisze istniejący wpis** — z wartością i zmienioną etykietą
   przycisku („Popraw wpis"). Bez tego „Zapisz" na już zważonym dniu wygląda jak dodawanie.

3. **Brak zasięgu to NIE nieudany zapis.** Wpis siedzi w Dexie i pojedzie synchronizacją, więc
   z punktu widzenia użytkownika zapis się udał. Komunikat o błędzie skłaniałby do wpisania
   wagi drugi raz, czyli do konfliktu.

4. **Statystyki: serwer, gdy jest sieć; `computeLocalStats` gdy jej nie ma.** Funkcja składa
   DOKŁADNIE ten sam kształt odpowiedzi z funkcji `lib/metrics.ts` (mirror backendu), więc ekran
   ma jedno wejście danych i jedną ścieżkę renderowania. Własnej arytmetyki tam nie ma — rozjazd
   oznaczałby inną średnią tygodniową zależnie od zasięgu. Ekran sygnalizuje, że liczby są lokalne.

5. **Dzień kalendarzowy na osi X to POŁUDNIE, nie północ.** Północ leży na granicy doby i przy
   zmianie czasu potrafi wylądować w dniu poprzednim — punkt przeskakuje o kratkę bez powodu
   w danych. Ta sama konwencja co w `lib/metrics.ts`.

6. **Średnia tygodniowa siada w ŚRODKU tygodnia** (czwartek 12:00 = trzy doby od południa
   poniedziałku). Średnia pon–niedz nie opisuje poniedziałku, a postawiona na granicy rozjeżdża się
   z chmurą pomiarów, przez którą ma przechodzić. Odruchowe „+3,5 dnia" od południa wypada
   w piątek i przekrzywia całą linię.

7. **Obie serie mają wspólną domenę osi Y z marginesem min. pół kilograma.** Bez wspólnej domeny
   linia średnich potrafi wypaść poza chmurę pomiarów, w której z definicji leży; bez dolnej
   granicy marginesu waga zmienna o 200 g rysuje się jako płaska kreska przy krawędzi.

8. **Dwie serie na jednej osi Y są tu poprawne** — to ta sama wielkość w tych samych kilogramach.
   Zasada „jedna oś Y" (DESIGN §10) zabrania dwóch SKAL, nie dwóch serii.

9. **Podziałka osi Y wykresu wagi jest bez jednostki.** Waga ma część dziesiętną, więc „84.6 kg"
   nie mieści się w szerokości osi i Recharts łamie etykietę na dwie linie. Jednostkę niosą
   nagłówek kafla i tooltip.

10. **Granice pola są ostre po obu stronach (0 < waga < 400)** — takie same jak `CHECK` w bazie
    i `@DecimalMin/@DecimalMax` w `SaveBodyWeightRequest`. Dopuszczenie 0 albo 400 dałoby `400`
    z serwera zamiast komunikatu na ekranie.

**Otwarta sprawa (nie zaimplementowana świadomie):** PROMPT §5 wspomina o `includeDeload`
w porównaniach trendu, ale endpoint `/api/body-weights/stats` takiego parametru **nie ma** —
`is_deload` jest cechą TRENINGU, nie tygodnia ważenia. Przełączalne pomijanie deloadu żyje
w `TrendComparator` (`lib/metrics.ts`) i dotyczy trendu objętości, czyli etapu 8. Gdyby trend wagi
też miał pomijać tygodnie deloadowe, wymaga to zmiany kontraktu po stronie backendu — do ustalenia,
nie do dorobienia po cichu na froncie. **Domknięte w etapie 8:** przełącznik stanął przy trendzie
objętości na pulpicie (`GET /api/dashboard?includeDeload=`), waga ciała została bez niego, kontrakt
bez zmian.

## Decyzje architektoniczne (etap 8 — pulpit)

1. **Jedno żądanie na wejściu, stały zakres 27 tygodni; pigułki filtrują pamięć.** Pół roku
   agregatów waży tyle co nic, a przełączenie „3M → 1M" w hali nie może czekać na sieć. Jedynym
   wyjątkiem jest `includeDeload` — trend liczy serwer, więc przełącznik oznacza nowe żądanie.
   To jest świadomy koszt: sposób liczenia trendu to pytanie zadawane raz na kilka tygodni.

2. **`includeDeload` należy do trendu OBJĘTOŚCI i mieszka na pulpicie** — to domknięcie otwartej
   sprawy z etapu 7. Waga ciała go nie dostaje, bo `is_deload` jest cechą treningu, nie tygodnia
   ważenia, i nic w kontrakcie backendu się przez to nie zmienia.

3. **Backend oddaje WYŁĄCZNIE tygodnie z treningiem, więc front dokłada zerowe sloty osi**
   (`fillMissingWeeks`). Bez tego sześć tygodni przerwy znika z wykresu, a słupek sprzed dwóch
   miesięcy siada obok bieżącego i udaje zeszły tydzień — ten sam rodzaj kłamstwa, co oś
   kategorialna z etapu 6. Tydzień bez treningu ma tu prawdziwą wartość: zero. To nie jest
   agregowanie w przeglądarce; sumy przychodzą policzone.

4. **Zakres złożony z samych zer nie rysuje wykresu, tylko mówi to zdaniem.** Recharts dostaje
   wtedy zdegenerowaną domenę `[0, 0]`: znikają oś i numery tygodni, a kafel wygląda na zepsuty
   albo wciąż ładujący się.

5. **Stacked bar ma własny kształt segmentu.** `radius` Rechartsa zaokrągla każdy segment osobno
   (stos rozpada się na łańcuch pigułek), a 2 px przerwy między segmentami (DESIGN §10) nie umie
   w ogóle. Przerwa idzie NAD segmentem i omija najwyższy, żeby cały słupek nie był o 2 px niższy,
   niż mówi oś; przy segmencie cieńszym niż przerwa zostaje 1 px danych, bo kreska jest prawdziwa,
   a pusta przestrzeń kłamie.

6. **Kolor idzie za KUBEŁKIEM grupy, nie za pozycją w stosie.** Grup w bazie jest 11, slotów
   palety 8 i zapętlać ich nie wolno (DESIGN §3.4) — grupa spoza listy dostaje neutralny slot
   „inne", a pełne rozbicie na 11 grup idzie do tabeli pod wykresem, nie do kolejnych kolorów,
   których i tak nie dałoby się odróżnić.

7. **Tydzień deload ma podkreślenie w `--warning` pod słupkiem i słowo „deload" w tabeli** —
   kształt i tekst, nie sam kolor (DESIGN §9). „Mniej objętości" i „lekki tydzień z planu" to dwie
   różne wiadomości i nie wolno ich mylić.

8. **Pulpit pokazuje tylko zakresy 1M/3M/6M.** Przy „1R" byłyby 53 słupki tygodniowe na 390 px,
   czyli kreski po 4 px. Dłuższy horyzont niosą kalendarz i treningi w miesiącach. `ChartTile`
   dostał na to opcjonalny podzbiór pigułek, domyślnie nadal pełny.

9. **Kalendarz: tygodnie w kolumnach, dni tygodnia w wierszach.** Klasyczna siatka miesięczna
   zjadłaby na 390 px sześć ekranów. Siatka jest przewijana do końca (najnowszy tydzień po prawej),
   a dla czytnika ekranu ma jedno zdanie podsumowania — 180 osobnych komórek do przeklikania byłoby
   gorsze niż brak szczegółu.

10. **`from`/`to` z odpowiedzi to MOMENTY, i to `to` wyłączne.** Wzięcie z nich pierwszych dziesięciu
    znaków dawało kalendarz cofnięty o cały tydzień (15.03 to niedziela, a siatka snapuje do
    poniedziałku) i kafel z zakresem kończącym się jutro. Zamianę na dni kalendarzowe robi
    `dashboardDates()` przez `warsawCalendarDate` z `lib/metrics.ts`.

Z renderu — nie z lektury kodu — wyszły cztery rzeczy: zakres w kaflach kończył się jutrzejszą datą,
długa data w kaflu wagi ucinała się w pół słowa, kolumna „Deload" zgniatała tabelę do „0—",
a pusty zakres rysował ramkę bez zawartości.

## Decyzje architektoniczne (szablony treningów — uzupełnienie etapu 4)

Etap 4 zrobił **odpalanie** szablonu (`applyRoutine`, licznik `0/3` z `targetSets`, nazwa w pasku
sesji), ale nie dał żadnej drogi, żeby szablon POWSTAŁ: `lib/api/routines.ts` miał same `GET`-y,
a backend pełny CRUD. Sekcja „Nie masz jeszcze szablonów" była ślepym zaułkiem — dało się ją
wypełnić wyłącznie curlem.

1. **Dwie drogi do szablonu, bo to dwa różne momenty.** „Zapisz jako szablon" na podsumowaniu
   bierze układ, który właśnie się sprawdził (`/szablony` służy do poprawiania go później);
   edytor na `/szablony/nowy` układa plan z góry, zanim padnie pierwsza seria. Żadna z nich nie
   zastępuje drugiej.

2. **Cel powtórzeń z sesji to MEDIANA serii roboczych, nie wartość najczęstsza.** Pierwsza wersja
   brała modę i rozstrzygała remis najniższą wartością — na prawdziwej drabinie 3/2/1 z konta
   testowego robiła z sesji plan „3 serie × 1 powtórzenie". Mediana daje 2, przy stałych seriach
   (5/5/5) obie reguły dają to samo, a przy parzystej liczbie serii bierzemy DOLNY środek, żeby
   cel został liczbą całkowitą. Cel serii to liczba serii ROBOCZYCH — dokładnie to, co liczy
   licznik `0/3` na karcie ćwiczenia.

3. **Edytor wysyła KOMPLET pozycji, nigdy różnicy.** `PUT /api/routines/{id}` podmienia całą listę
   i pozycja pominięta w żądaniu dostaje tombstone (`backend/API.md`). Wysyłanie różnicy byłoby
   tu cichym kasowaniem. Ta sama reguła obowiązuje w Dexie: `saveRoutineLocally` stawia tombstone
   na pozycjach, których nie ma w nowej liście, bo zwykłe skasowanie wiersza nie dojechałoby do
   drugiego urządzenia — paczka sync wysyła rekordy, a nie informację o nieobecności.

4. **Kolejność ćwiczeń zmieniają strzałki, nie przeciąganie.** Lista jest w pionie w przewijanej
   stronie, więc drag na telefonie walczy ze scrollem i przegrywa — a gest nie może być jedyną
   drogą (DESIGN §9). `orderIndex` powstaje dopiero przy wysyłce, z pozycji w tablicy; trzymanie
   go w szkicu oznaczałoby przenumerowywanie wszystkiego przy każdym przesunięciu wiersza.

5. **Szablony działają bez zasięgu — w obie strony.** `lib/routines/store.ts` to jedyne miejsce
   zapisu: najpierw Dexie z `dirty = 1`, potem API, a `OfflineError` to NIE jest nieudany zapis
   (ta sama reguła co przy wadze i treningu). Lista czyta najpierw z Dexie, więc szablon da się
   odpalić w hali bez sieci — wcześniej `WorkoutStart` szedł prosto do API i pokazywał pustkę,
   mimo że rekordy leżały już na urządzeniu (sync ściąga `routines` i `routineItems` od etapu 5).
   `id` szablonu i pozycji nadaje KLIENT, bo serwer honoruje podane `id` (`RoutineService.create`)
   — rekord zapisany offline i ten sam wysłany po powrocie sieci to jeden wiersz, nie dwa.

6. **Usunięcie szablonu pyta o potwierdzenie**, inaczej niż usunięcie serii, które ma „Cofnij".
   Serię wpisuje się z powrotem w pięć sekund; szablon to praca włożona raz i używana miesiącami.

7. **Nazwy ćwiczeń dociągamy z katalogu**, bo `RoutineResponse` niesie same `exerciseId`. Gdy
   ćwiczenia nie ma w katalogu, wiersz mówi „Ćwiczenie spoza katalogu" — „?" ukrywałoby fakt, że
   ćwiczenie zostało skasowane. Dociągnięcie katalogu nie nadpisuje szkicu, który user zdążył już
   zmienić: nazwy wchodzą dopiero przy renderze.

Sprawdzone na żywym backendzie (konto `Demo`): utworzenie, edycja z przestawieniem kolejności,
start treningu z szablonu (kolejność i licznik `0/4`), zapis z zakończonej sesji, usunięcie,
oraz pełna ścieżka offline — lista z Dexie, zapis bez zasięgu i dowiezienie go na serwer przez
synchronizację po powrocie sieci.

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
      szablony/page.tsx         # lista szablonów; [id]/page.tsx = edytor ("nowy" = pusty)
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
    bodyweight/store.ts       # JEDYNE miejsce zapisu wagi (Dexie -> API)
    bodyweight/stats.ts       # lokalny odpowiednik /stats (mirror metrics) na brak sieci
    bodyweight/points.ts      # punkty wykresu wagi, domena osi Y (+ testy)
    bodyweight/input.ts       # walidacja pola wagi, dzisiejsza data (+ testy)
    db/body-weight-repository.ts # wpisy wagi w Dexie, upsert po DNIU
    charts.ts                 # zakresy czasu, sloty palety, skala punktu, kubełki grup (+ testy)
    routines/draft.ts         # szkic szablonu: zmiany, walidacja, szkic z sesji (+ testy)
    routines/store.ts         # JEDYNE miejsce zapisu szablonu (Dexie -> API)
    db/routine-repository.ts  # szablony w Dexie: tombstone'y pozycji, wersja serwera
    dashboard/volume.ts       # wiersze wykresu objętości, dopełnianie pustych tygodni (+ testy)
    dashboard/calendar.ts     # siatka kalendarza treningów (+ testy)
    dashboard/range.ts        # zakres pulpitu: ile tygodni, momenty -> dni (+ testy)
    api/dashboard.ts          # GET /api/dashboard
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
  components/bodyweight/      # ekran wagi: wpis, kafle, wykres, lista pomiarów
  components/dashboard/       # pulpit: ekran i kalendarz treningów
  components/routines/        # szablony: lista, edytor, "zapisz sesję jako szablon"
  components/charts/chrome.tsx # wspólny chrom wykresów (osie, marginesy, tooltip)
  app/manifest.ts             # manifest PWA (generowany przez Next, nie plik w public/)
  public/sw.js                # service worker: TYLKO powłoka, zero cache'owania API
  public/icons/               # ikony PWA (generuje design/generate-icons.py)
  types/api.ts                # kontrakt z backendem
  types/sync.ts               # kontrakt paczki POST /api/sync (mirror SyncRecords.java)
  e2e/10-offline-sync.spec.ts # cała sesja offline -> serwer po powrocie sieci
  e2e/11-history-and-exercise.spec.ts # historia, wejście w sesję i ćwiczenie, zakres i tabela
  e2e/12-body-weight.spec.ts  # zapis wagi, upsert po dniu, walidacja zakresu
  e2e/13-dashboard.spec.ts    # kafle zgodne z backendem, zakres bez sieci, przełącznik deloadu
  e2e/14-routines.spec.ts     # szablon: edytor, podmiana pozycji, start, zapis z sesji, kasowanie
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
- [x] **Etap 7 — moduł wagi ciała.** Szybki wpis (jeden na dzień, edytowalny, z ostrzeżeniem
  o nadpisaniu), kafle (ostatnia waga, średnia tygodnia, zmiana tydzień do tygodnia), trend
  4-tygodniowy, wykres wg DESIGN §10 (surowe pomiary jako jasne punkty, średnie tygodniowe jako
  linia na wierzchu, tydzień niepełny jako pusty punkt z obwódką), przełącznik zakresu i tabela,
  lista ostatnich pomiarów z usuwaniem. Zapis idzie najpierw do Dexie, więc działa bez zasięgu.
  Odpalone tutaj: `lint`, `typecheck`, `vitest` (134 testy), `build`, `playwright` (76 testów,
  oba profile) — zielone; ekran obejrzany przy 390 px na koncie z 44 pomiarami z 13 tygodni
  (w tym dwa tygodnie niepełne), a upsert potwierdzony przez API: dwa zapisy tego samego dnia
  zostawiają JEDEN wiersz z poprawioną wartością.
- [x] **Etap 8 — pulpit.** Kafle (treningi, serie robocze, objętość) z zakresu, trend tydzień do
  tygodnia z przełącznikiem `includeDeload`, wykres objętości tygodniowej per grupa mięśniowa
  (stacked bar wg DESIGN §10 z własnym kształtem segmentu, zakres 1M/3M/6M, tabela, legenda
  i rozwijane rozbicie na pełne 11 grup), kalendarz treningów (tygodnie w kolumnach), treningi
  w miesiącach, ostatnie rekordy prowadzące do ekranu ćwiczenia, skrót wagi ciała. Wszystkie
  agregaty liczy backend jednym żądaniem; front dokłada tylko zerowe tygodnie, których serwer
  nie wysyła. Odpalone tutaj: `lint`, `typecheck`, `vitest` (168 testów), `build`,
  `playwright` (82 testy, oba profile) — zielone; ekran obejrzany na żywym backendzie (:8080)
  kontem `Demo` (16 treningów z progresją, dwa tygodnie deload) przy 320 / 390 / 430 px
  w obu motywach, bez poziomego scrolla.
- [ ] Etap 9 — eksport XLSX (najpierw decyzja: ExcelJS na froncie vs Apache POI w Springu — `PROMPT.md` §7).

## Konwencje

- **Zero literałów kolorów w komponentach.** Każdy kolor przez token (`bg-surface`, `text-ink-3`, `border-hairline`). Kolory statusu, które nie mają utility Tailwinda, przez `style={{ color: "var(--critical)" }}` — nadal token, nie hex.
- **Zero zapytań `fetch` poza `lib/api/`.** Komponent, który sam woła `fetch`, omija refresh tokenu i wyloguje użytkownika przy pierwszym wygaśnięciu.
- Logika obliczeniowa wyłącznie w `lib/metrics.ts`, jako czyste funkcje z testami. Komponenty liczą tylko układ.
- Ciężkie agregacje (dashboard, cała historia) robi backend zapytaniem `GROUP BY`/`SUM`. `lib/metrics.ts` liczy na danych już pobranych pod konkretny ekran.
- Każda zmiana kształtu żądania/odpowiedzi API jest **zmianą kontraktu** z backendem — zgłaszana wprost, nie obchodzona adapterem w kliencie.
