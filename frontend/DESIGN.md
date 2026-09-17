# easy-gym — system projektowy (front)

Źródło prawdy dla wyglądu aplikacji. Tokeny w kodzie: `app/globals.css` (etap 2 przeniósł tam `design/tokens.css` — jedna kopia, żeby nie było dryfu).
Kontekst produktowy i kontrakt API: `PROMPT.md`.

## 1. Dla kogo i w jakich warunkach

To nie jest dashboard oglądany przy biurku. Realne warunki użycia:

- **jedna ręka, kciuk, druga ręka trzyma hantlę albo telefon leży na ławce** — wszystko, co klikasz w trakcie serii, musi być w dolnej połowie ekranu,
- **spocone palce, 30 sekund przerwy, tętno 160** — zero precyzyjnego celowania, zero czytania długich etykiet,
- **złe światło i ekran z jasnością na minimum albo w słońcu przy oknie** — kontrast musi być brutalny, nie subtelny,
- **brak zasięgu w suterenie** — stan offline to stan normalny, nie błąd, i nie może wyglądać jak awaria.

Z tego wynikają cztery zasady, którym podporządkowane jest wszystko poniżej:

1. **Liczba jest interfejsem.** Ciężar i powtórzenia to największe elementy na ekranie. Reszta (etykiety, jednostki, opisy) schodzi do szarości i małego stopnia.
2. **Kolor zawsze coś znaczy.** Interfejs jest z żelaza i kredy — szarości i biel. Barwa pojawia się wyłącznie jako dana (wykres), stan (sukces/błąd/offline) albo rekord (złoto). Nie ma dekoracyjnych kolorów.
3. **Kciuk przed oczami.** Akcja wykonywana w trakcie serii ma ≥ 48 px wysokości i leży poniżej połowy ekranu. Akcja rzadka i nieodwracalna może być mała i wysoko.
4. **Cisza przy zapisie.** Zapis jest optymistyczny i niewidoczny. Kręcące się spinnery przy każdej serii to główny sposób, w jaki taka apka staje się nieznośna.

## 2. Kierunek wizualny — „żelazo i kreda"

Ciemne, lekko chłodne szarości odlewu żeliwnego jako tło; kredowa, ciepła biel jako główny atrament i jako wypełnienie przycisku głównego. Numery ustawione wąskim, ciężkim krojem — bliżej tablicy wyników i stempla na talerzu niż typografii aplikacji finansowej. Jedyny chromatyczny akcent interfejsu (lodowy cyjan) rezerwujemy na stan: zaznaczenie, focus, pierścień timera. Złoto pojawia się wyłącznie przy rekordach — jeśli świeci na złoto, to znaczy, że coś pobiłeś.

Świadomie **nie** robimy: kolorowych gradientów, kart z akcentowym paskiem z boku, jednego promienia zaokrąglenia na wszystkim, emoji jako ikon sekcji, neonowej limonki jako „koloru siłowni".

## 3. Kolor

Domyślny motyw to **ciemny**. Jasny istnieje (telefon w słońcu), ale jest wariantem, nie odwróceniem — kroki są dobrane osobno, nie wygenerowane z ciemnych.

### 3.1 Powierzchnie i atrament

| Rola | Token | Dark (domyślny) | Light |
|---|---|---|---|
| Tło strony | `--bg` | `#0E0F11` | `#FAFAF8` |
| Karta / sekcja | `--surface` | `#16181B` | `#FFFFFF` |
| Input, element podniesiony | `--surface-2` | `#1F2227` | `#F1F1EE` |
| Stan wciśnięty / hover | `--surface-3` | `#2A2E34` | `#E4E4E0` |
| Włos (obramowanie) | `--hairline` | `rgba(255,255,255,.09)` | `rgba(16,17,20,.10)` |
| Atrament główny | `--ink` | `#F3F2EE` | `#101114` |
| Atrament drugorzędny | `--ink-2` | `#B9BCC0` | `#4A4E55` |
| Atrament wygaszony (etykiety, „ostatnio:") | `--ink-3` | `#80858C` | `#767B83` |

Szarości mają lekki chłodny odchył ku cyjanowi — czysta neutralna szarość obok kredowej bieli wygląda na przypadkową.

### 3.2 Akcje i stan

| Rola | Token | Dark | Light | Gdzie |
|---|---|---|---|---|
| Przycisk główny (wypełnienie) | `--cta` / `--cta-ink` | `#F3F2EE` / `#0E0F11` | `#101114` / `#FAFAF8` | „Zatwierdź serię", „Rozpocznij trening", „Zakończ trening" |
| Akcent stanu | `--accent` / `--accent-ink` | `#46D5E0` / `#06191C` | `#0E8697` / `#FFFFFF` | zaznaczona zakładka, focus ring, pierścień timera, aktywny input serii |
| Rekord | `--pr` / `--pr-wash` | `#F0B429` / `rgba(240,180,41,.12)` | `#B07607` / `rgba(176,118,7,.10)` | plakietka PR, podświetlony wiersz, baner w podsumowaniu |

### 3.3 Status (stały, nigdy nie tematyzowany, nigdy jako kolor serii)

| Rola | Hex | Znaczenie w tej apce |
|---|---|---|
| `--good` | `#0CA30C` | zsynchronizowane, dodatnia delta wagi |
| `--warning` | `#FAB219` | tydzień niepełny (< 2 pomiary), kolejka sync czeka |
| `--serious` | `#EC835A` | offline (stan normalny, nie awaria — kolor ostrzegawczy, nie czerwony) |
| `--critical` | `#D03B3B` | błąd zapisu/konfliktu, ujemna delta wagi, usunięcie |

Status **nigdy nie niesie znaczenia samym kolorem** — zawsze z ikoną i etykietą (`● Offline`, `⟳ 3 w kolejce`). Daltonizm plus ekran w słońcu to ten sam problem dwa razy.

Uwaga na kolizję semantyczną: zielony = „dodatnia delta", a przy wadze ciała dodatnia delta nie znaczy „dobrze" (zależy od celu). Prompt każe trzymać konwencję „minus czerwony / plus zielony" (spójność z eksportem XLSX), więc ją trzymamy — ale strzałka i znak liczby są tam obowiązkowe, kolor jest tylko wzmocnieniem.

### 3.4 Paleta wykresów (kategorialna, 8 slotów)

Kolejność slotów jest **mechanizmem bezpieczeństwa dla daltonizmu**, nie estetyką — nie przestawiaj jej i nie zapętlaj na 9. serii. Przewalidowane skryptem na naszych powierzchniach (dark `#16181B`, light `#FFFFFF`): pasmo jasności, minimum chromy, separacja CVD (najgorsza para sąsiednia ΔE 8.4), próg dla widzenia normalnego (ΔE 19.3) i kontrast ≥ 3:1 — wszystko przechodzi. W jasnym motywie trzy sloty (aqua, żółty, magenta) są poniżej 3:1 wobec bieli → tam **obowiązkowe są widoczne etykiety albo widok tabeli**.

| Slot | Barwa | Dark | Light |
|---|---|---|---|
| 1 | niebieski | `#3987E5` | `#2A78D6` |
| 2 | pomarańczowy | `#D95926` | `#EB6834` |
| 3 | akwa | `#199E70` | `#1BAF7A` |
| 4 | żółty | `#C98500` | `#EDA100` |
| 5 | magenta | `#D55181` | `#E87BA4` |
| 6 | zielony | `#008300` | `#008300` |
| 7 | fiolet | `#9085E9` | `#4A3AA7` |
| 8 | czerwony | `#E66767` | `#E34948` |

**Mapowanie grup mięśniowych na sloty.** W bazie jest 11 grup, slotów jest 8 i nie wolno ich zapętlić. Wykres objętości tygodniowej używa więc stałego, **wyłącznie prezentacyjnego** mapowania (nigdy zapisywanego do bazy — `MUSCLE_GROUP_BUCKETS` w `lib/charts.ts`):

| Slot | Kubełek na wykresie | Grupy z bazy |
|---|---|---|
| 1 | klatka piersiowa | `klatka piersiowa` |
| 2 | plecy | `plecy` |
| 3 | nogi | `nogi`, `łydki` |
| 4 | barki | `barki` |
| 5 | ramiona | `biceps`, `triceps`, `przedramiona` |
| 6 | pośladki | `pośladki` |
| 7 | brzuch | `brzuch` |
| 8 | całe ciało | `całe ciało` |

Kolor idzie za kubełkiem, nie za jego pozycją w stosie — filtr zmieniający liczbę serii nie przemalowuje pozostałych. Rozbicie na 11 grup pokazujemy w tabeli pod wykresem, nie dokładaniem kolorów.

### 3.5 Kolory talerzy (kalkulator obciążenia)

To jedyne miejsce, gdzie kolor jest dosłownie skopiowany z rzeczywistości — standard IWF, więc użytkownik rozpoznaje go bez legendy: 25 kg czerwony `#D42B24`, 20 kg niebieski `#1C68B3`, 15 kg żółty `#E8B517`, 10 kg zielony `#2C8C3E`, 5 kg biały `#E9E7E1`, 2.5 kg czerwony `#D42B24`, 1.25 kg chrom `#9AA0A6`. Nie mieszać z paletą wykresów — inna rola, inne miejsce na ekranie.

## 4. Typografia

Dwa kroje, oba z Google Fonts, oba z pełną polską diakrytyką:

- **Archivo** (zmienny, oś `wdth`) — liczby i nagłówki ekranów. Numery ustawiamy zwężone (`font-variation-settings: 'wdth' 88`) i ciężkie (600–800), zawsze `font-variant-numeric: tabular-nums`. Zwężony, stemplowany numer to sygnatura tej apki.
- **Public Sans** — cały interfejs tekstowy, etykiety, opisy.

Fallback: `system-ui, -apple-system, "Segoe UI", sans-serif`.

| Rola | Rozmiar / interlinia | Krój |
|---|---|---|
| `num-hero` — ciężar w aktywnej serii | 40 / 40 px, 700 | Archivo wdth 88 |
| `num-lg` — wartość kafla, oś PR | 30 / 32 px, 700 | Archivo wdth 88 |
| `num-md` — liczba w wierszu serii, historia | 22 / 24 px, 600 | Archivo wdth 90 |
| `title` — tytuł ekranu | 20 / 26 px, 650 | Archivo wdth 95 |
| `body` — tekst, **każdy input** | 16 / 24 px, 400 | Public Sans |
| `label` — etykieta sekcji, wersalik | 13 / 16 px, 600, `letter-spacing .06em` | Public Sans |
| `meta` — „ostatnio: 100 × 5", jednostki, podpisy | 12 / 16 px, 400 | Public Sans |

**16 px to twarde minimum dla `<input>`** — mniejszy stopień powoduje na iOS auto-zoom przy focusie, co w trakcie serii jest katastrofą UX. Jednostki (`kg`, `powt.`) zawsze w `meta` i w `--ink-3`, nigdy w tym samym stopniu co liczba.

## 5. Siatka, odstępy, kształty

- Baza 4 px. Skala: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48.
- **Margines boczny strony: 16 px**, ustawiany raz na wrapperze. Projektujemy na 390 px szerokości; przy ≥ 640 px treść dostaje `max-width: 560px` i centruje się — apka nie rozlewa się na desktopie, bo i tak nie jest do niego.
- Promienie: karta `14px`, kontrolka/input `10px`, pigułka i plakietka `999px`, wykres bez zaokrągleń poza końcami słupków (4 px).
- Cienie: **brak**. Hierarchię niesie jasność powierzchni (`--surface` → `--surface-2` → `--surface-3`) i włos. Cienie na ciemnym tle i tak są niewidoczne, a kosztują wydajność przy scrollu.
- Nie wszystko jest kartą: kartę dostaje ćwiczenie w treningu i kafel wykresu. Lista serii wewnątrz ćwiczenia to wiersze rozdzielone włosem, nie osiem zagnieżdżonych kart.

### Bezpieczne strefy

- Górny pasek: `position: sticky; top: env(safe-area-inset-top, 0px)`, wysokość 56 px.
- Dolna nawigacja: `position: fixed; bottom: 0; padding-bottom: env(safe-area-inset-bottom, 0px)`, wysokość 64 px + safe area.
- Timer przerwy wjeżdża nad dolną nawigacją; treść listy dostaje `padding-bottom` równy sumie obu, żeby ostatnia seria nie chowała się pod paskiem.

## 6. Cele dotykowe

| Element | Minimum |
|---|---|
| Cokolwiek klikalnego | 44 × 44 px |
| Input ciężaru / powtórzeń | 48 px wysokości, szerokość wypełnia kolumnę |
| Stepper `−2.5 / +2.5`, `−1 / +1` | 56 × 48 px, odstęp 8 px między przyciskami |
| „Zatwierdź serię" | 48 px, pełna szerokość kolumny akcji |
| Zakładka w dolnej nawigacji | 64 px wysokości, cała szerokość slotu |
| Ikona w górnym pasku | 44 × 44 px (sama ikona 20 px) |

Odstęp między sąsiednimi celami dotykowymi: minimum 8 px. Steppery `−` i `+` nigdy nie stykają się krawędziami.

## 7. Komponenty — specyfikacja

### 7.1 Wiersz serii (najważniejszy komponent w aplikacji)

Trzy kolumny w jednym wierszu o wysokości 48 px, plus linijka kontekstu pod spodem:

```
┌──────────────────────────────────────────────┐
│  2 │  [ 102.5 ] kg  ×  [ 5 ] powt.  │   ✓    │   ← 48 px
│    │  ostatnio: 100 × 5                      │   ← 12 px, --ink-3
└──────────────────────────────────────────────┘
```

- **Numer serii** — 24 px kolumna, `meta`, `--ink-3`. Seria rozgrzewkowa zamiast numeru pokazuje `R` w pigułce `--surface-3` (rozgrzewka jest wykluczona z PR/e1RM/objętości, więc musi być widoczna od pierwszego spojrzenia).
- **Inputy** — `inputMode="decimal"`, `--surface-2`, 16 px tekst, wyrównanie do prawej, `tabular-nums`. Aktywny input dostaje 2 px obwódkę `--accent`.
- **„ostatnio: 100 × 5"** — wynik tego ćwiczenia z poprzedniego treningu, `meta` / `--ink-3`. To jest punkt odniesienia, nie ozdoba — zniknięcie tej linijki psuje cały ekran.
- **✓ Zatwierdź** — 48 × 48 px. Przed zatwierdzeniem: obrys `--hairline`, ikona `--ink-3`. Po zatwierdzeniu: wypełnienie `--cta`, ikona `--cta-ink`, wiersz gaśnie do 70% i startuje timer przerwy.
- **Steppery** — pokazują się pod inputami tylko dla wiersza aktywnego (edytowanego). Cztery przyciski 56 × 48: `−2.5` `+2.5` `−1` `+1`.
- **Kopiuj poprzednią serię** — jeden przycisk na dole listy serii, nie przy każdym wierszu.
- **Usunięcie** — swipe w lewo (próg 96 px) albo long-press 500 ms → wiersz odsłania czerwone tło `--critical`. Usunięcie to **soft delete**, więc natychmiast po nim pojawia się toast z „Cofnij" (8 s).
- **PR** — wiersz, który pobił rekord, dostaje tło `--pr-wash` i plakietkę `PR` w `--pr`. Remis nie jest rekordem i nie świeci.

### 7.2 Karta ćwiczenia w treningu

Nagłówek: nazwa ćwiczenia (`title`), pod nią `meta` z grupą mięśniową i objętością bieżącą. Po prawej ikona menu (44 px): notatka, czas przerwy dla tego ćwiczenia, usuń ćwiczenie. Pod nagłówkiem lista wierszy serii rozdzielona włosem, na końcu `+ Dodaj serię` (48 px, obrys, pełna szerokość).

### 7.3 Timer przerwy

Przyklejony pasek nad dolną nawigacją, wysokość 64 px, tło `--surface-2`, na górnej krawędzi 2 px pasek postępu w `--accent` kurczący się od 100% do 0.

- Czas w `num-md`, `tabular-nums`, format `1:47`.
- Po prawej dwa przyciski 44 px: `+30 s` i `Pomiń`.
- Ostatnie 10 sekund: pasek i liczba przechodzą na `--warning`, jedna wibracja na 0 (`navigator.vibrate`) plus powiadomienie systemowe, jeśli zgoda udzielona.
- Domyślnie 2:00, konfigurowalny per ćwiczenie. Timer startuje **sam** po zatwierdzeniu serii — nikt nie klika „start" między seriami.

### 7.4 Pasek stanu synchronizacji

Pigułka w górnym pasku, zawsze ikona + tekst, nigdy sam kolor:

| Stan | Wygląd |
|---|---|
| Online, wszystko zapisane | nic nie pokazujemy (cisza = norma) |
| Kolejka czeka | `⟳ 3` w `--warning`, tło `--surface-2` |
| Offline | `● Offline` w `--serious` |
| Błąd synchronizacji | `▲ Błąd sync` w `--critical`, klikalne → ekran szczegółów konfliktu |

Offline **nie jest awarią** i nie dostaje czerwieni ani modala. Trening ma działać identycznie.

### 7.5 Podsumowanie treningu

Trzy kafle w rzędzie (`num-lg` + `label`): czas trwania, objętość, liczba serii. Pod nimi, jeśli coś padło, sekcja `Rekordy` — każdy PR jako wiersz z plakietką w `--pr`: kategoria (`Najwyższy ciężar`, `Najwyższy e1RM`, `Największa objętość`, `PR w zakresie 4–6`), wartość i poprzednia wartość drobnym drukiem. To jedyny ekran, gdzie złota jest dużo.

### 7.6 Kafel wykresu

Nagłówek: tytuł (`label`, wersalik) i po prawej wartość bieżąca (`num-lg`). Pod spodem przełącznik zakresu jako rząd pigułek: `1M` `3M` `6M` `1R` `Całość` (44 px wysokości, aktywna w `--accent-ink` na `--accent`). Sam wykres poniżej, wysokość 200 px na mobile.

### 7.7 Stany puste i ładowanie

- **Zero spinnerów przy zapisie.** Zapis idzie do Dexie i UI od razu pokazuje wynik.
- Ładowanie danych historycznych: szkielety (`--surface-2`, animacja pulsowania 1.5 s, wyłączana przez `prefers-reduced-motion`), nie spinner.
- Pusty ekran: jedno zdanie po polsku mówiące, co zrobić, plus przycisk główny. Bez ilustracji i bez „Ups!".

## 8. Ruch

Krótki i funkcjonalny. `120ms ease-out` na stanach kontrolek, `200ms` na wjazdach paneli, `transform`/`opacity` wyłącznie. Timer i pasek postępu to jedyne animacje ciągłe. Wszystko poza informacją zwrotną dotyku wyłączane przy `prefers-reduced-motion: reduce`.

## 9. Dostępność

- Kontrast tekstu: `--ink` na `--bg` ≥ 15:1, `--ink-3` na `--surface` ≥ 4.5:1 dla tekstu 12 px. Tekst na `--cta` i `--accent` zawsze w dedykowanym `*-ink`.
- Focus: 2 px obwódka `--accent` z 2 px offsetem. Nigdy `outline: none` bez zamiennika — apka jest używana także z klawiaturą na desktopie przy wpisywaniu zaległych treningów.
- Każdy input ma `<label>` (może być wizualnie ukryty, ale `aria-label` na gołym polu ciężaru to za mało dla czytnika).
- Ikony akcji mają tekstową nazwę dostępną; swipe-to-delete ma alternatywę w menu wiersza (gest nie jest dostępny dla wszystkich).
- Stan (PR, rozgrzewka, offline) zawsze ma kształt/tekst obok koloru.

## 10. Wykresy — reguły twarde

- **Jedna oś Y.** Nigdy dwóch skal na jednym wykresie. Dwie wielkości o różnej skali → dwa wykresy.
- Główny wykres ćwiczenia: ciężar najcięższej serii w czasie, **rozmiar punktu skalowany liczbą powtórzeń**, tooltip `102.5 kg × 5 @RPE 8`. To wymóg produktowy, nie ozdoba.
- Waga ciała: surowe pomiary jako jasne punkty 8 px w `--ink-3`, średnie tygodniowe jako linia 2 px na wierzchu; tydzień niepełny (< 2 pomiary) jako punkt pusty z obwódką `--warning`.
- Objętość tygodniowa per grupa: stacked bar, **2 px przerwy w kolorze powierzchni między segmentami**, końce słupka zaokrąglone 4 px.
- Linie 2 px, markery ≥ 8 px, siatka i osie w `--ink-3` na hairline, etykiety osi `tabular-nums`.
- Legenda obecna zawsze przy ≥ 2 seriach; przy ≤ 4 seriach dodatkowo etykiety bezpośrednie. Tożsamość serii nigdy nie zależy wyłącznie od koloru.
- Tooltip/crosshair to element domyślny, nie dodatek. Pod każdym wykresem przełącznik „Tabela" — to jednocześnie tryb dostępny i sposób na sprawdzenie liczby bez celowania palcem w punkt.
- Tekst wykresu bierze kolor z tokenów motywu, nigdy z koloru serii.

## 11. Nawigacja

Dolna belka, cztery zakładki, polskie etykiety pod ikonami (11 px): **Pulpit · Trening · Historia · Waga**. Ustawienia i eksport wchodzą przez ikonę w górnym pasku, nie jako piąta zakładka.

Gdy trening jest w toku, nad belką siedzi trwały pasek `Trening trwa · 42:15` klikalny w powrót do ekranu treningu — z każdego miejsca apki, bez cofania.

## 12. Mapowanie na kod

Tailwind v4 (konfiguracja w CSS, bez `tailwind.config.js`). Komplet zmiennych i blok `@theme inline` siedzi w `app/globals.css` — przeniesione tam w etapie 2, `design/tokens.css` już nie istnieje (dwie kopie tokenów rozjechałyby się przy pierwszej korekcie koloru).

Zasady:
- **Zero literałów kolorów w komponentach.** Każdy kolor przez token (`bg-surface`, `text-ink-3`, `border-hairline`).
- Motyw ciemny jest domyślny: komplet tokenów siedzi w `:root`, wariant jasny w `@media (prefers-color-scheme: light)` i w `[data-theme="light"]` (ręczny przełącznik musi wygrywać w obie strony).
- Klasy pomocnicze dla typografii numerycznej (`.num`, `.num-hero`, `.num-lg`, `.num-md`) ustawiają Archivo + `tabular-nums` + oś `wdth` — nie powtarzamy tego w każdym komponencie.
- Kolory serii wykresów są dostępne jako `--series-1..8` i **wyłącznie** tam używane.
