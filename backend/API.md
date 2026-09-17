# easy-gym API — kontrakt

Base URL: `NEXT_PUBLIC_API_URL` (dev `http://localhost:8080`). Wszystko poza `/api/auth/*`,
`/api/admin/*` i `/actuator/health` wymaga nagłówka `Authorization: Bearer <accessToken>`.

Zasady wspólne dla całego API:

- **`user_id` NIGDY nie jest przyjmowane z requestu.** Serwer bierze je z JWT (`CurrentUser`), a
  to, co przyśle klient, ignoruje. Rekord cudzego usera to `404` (nie `403`) — istnienie UUID-a na
  innym koncie nie jest ujawniane.
- **Usuwanie jest miękkie.** `DELETE` ustawia `deletedAt` i bumpuje `updatedAt` (tombstone), żeby
  skasowanie dojechało przez sync na drugie urządzenie. Rekordy z `deletedAt` nie wracają w
  zwykłych odczytach — tylko w `/api/sync`.
- **`id` może pochodzić z klienta.** Wszystkie encje synchronizowane mają UUID generowany w Dexie;
  w `POST` można je podać, a gdy go nie ma — serwer wygeneruje własne.
- **e1RM i PR liczą się na żywo** z parametru `?formula=epley|brzycki` (domyślnie `epley`). Nic z
  tego nie jest zapisywane w bazie — zmiana formuły w ustawieniach nie fałszuje historii.
  Brzycki dla `reps > 36` zwraca `null` (nie liczbę).
- **Błędy zawsze jako JSON `{"error": "..."}"`**: `400` walidacja, `401` brak/nieważny token,
  `403` operacja zabroniona (np. edycja ćwiczenia globalnego), `404` nie istnieje / cudze,
  `409` konflikt unikalności.
- Daty: `Instant` w ISO-8601 UTC (`2026-09-01T16:00:00Z`), dni jako `2026-09-01`.
  Tygodnie są ISO-8601 (pon–niedz), liczone w `Europe/Warsaw`.

## Auth i konta

| Metoda | Ścieżka | Body / nagłówki | Odpowiedź |
|---|---|---|---|
| `POST` | `/api/auth/login` | `{login, password}` | `200 {accessToken, refreshToken, expiresInSeconds}` |
| `POST` | `/api/auth/refresh` | `{refreshToken}` | `200` jw., **z nowym refresh tokenem (rotacja)** |
| `POST` | `/api/auth/logout` | `{refreshToken}` | `204` |
| `GET` | `/api/me` | — | `200 {userId, login}` |
| `GET` | `/api/profile` | — | `200 {userId, login, displayName, unit, createdAt}` |
| `PUT` | `/api/profile` | `{displayName}` | `200` jw. |
| `POST` | `/api/admin/users` | `X-Bootstrap-Secret` + `{login, password}` | `201 {id, login, createdAt}` |

Profil powstaje leniwie przy pierwszym `GET /api/profile` (`displayName` = login). Formuły e1RM
celowo nie ma w profilu — jest parametrem zapytań.

## Ćwiczenia

| Metoda | Ścieżka | Uwagi |
|---|---|---|
| `GET` | `/api/exercises?query=&includeArchived=false` | katalog globalny + własne; `query` = fuzzy search (pg_trgm) |
| `GET` | `/api/exercises/{id}` | |
| `POST` | `/api/exercises` | `{id?, name, muscleGroup, equipment, isArchived?}` → `201` |
| `PUT` | `/api/exercises/{id}` | tylko własne; globalne → `403` |
| `DELETE` | `/api/exercises/{id}` | soft delete, tylko własne → `204` |
| `GET` | `/api/exercises/{id}/history?from&to&limit=100&formula=` | dane ekranu ćwiczenia |

`equipment`: `barbell` \| `dumbbell` \| `machine` \| `cable` \| `bodyweight` \| `other`.

```jsonc
// GET /api/exercises
[{ "id": "...", "userId": null, "name": "Wyciskanie sztangi na ławce płaskiej",
   "muscleGroup": "klatka piersiowa", "equipment": "barbell", "isArchived": false,
   "global": true, "createdAt": "...", "updatedAt": "...", "deletedAt": null }]

// GET /api/exercises/{id}/history
{ "exerciseId": "...", "name": "...", "muscleGroup": "...", "equipment": "...",
  "sessions": [                          // chronologicznie, najstarsza pierwsza
    { "workoutId": "...", "startedAt": "...", "isDeload": false,
      "sets": [{ "id": "...", "setIndex": 0, "weightKg": 100.00, "reps": 5, "rpe": 8.0,
                 "isWarmup": false, "toFailure": false, "assisted": false,
                 "e1rmKg": 116.67, "completedAt": "...", "updatedAt": "...", "deletedAt": null }],
      "displayVolumeKg": 500.00, "prEligibleVolumeKg": 500.00,
      "heaviestSet": { /* SetResponse */ }, "bestE1rmKg": 116.67 }],
  "personalRecords": { "maxWeight": {"setId": "...", "value": 105.00},
                       "maxE1rm": {"setId": "...", "value": 122.50},
                       "maxSessionVolume": {"workoutId": "...", "value": 1500.00},
                       "byRepRange": { "FOUR_TO_SIX": {"setId": "...", "value": 105.00} } } }
```

`byRepRange`: `ONE`, `TWO_TO_THREE`, `FOUR_TO_SIX`, `SEVEN_TO_TEN`, `ELEVEN_TO_FIFTEEN`, `FIFTEEN_PLUS`.

## Szablony treningów (routines)

| Metoda | Ścieżka | Uwagi |
|---|---|---|
| `GET` | `/api/routines` | z pozycjami |
| `GET` | `/api/routines/{id}` | |
| `POST` | `/api/routines` | `{id?, name, notes?, items: [{id?, exerciseId, orderIndex, targetSets?, targetReps?}]}` |
| `PUT` | `/api/routines/{id}` | **podmienia całą listę pozycji** — brakujące dostają tombstone |
| `DELETE` | `/api/routines/{id}` | soft delete razem z pozycjami |

## Treningi

| Metoda | Ścieżka | Uwagi |
|---|---|---|
| `GET` | `/api/workouts?from&to&limit=30&offset=0` | lista z podsumowaniem liczonym w bazie |
| `GET` | `/api/workouts/active?formula=` | ostatni bez `endedAt`; `204` gdy żadnego nie ma |
| `GET` | `/api/workouts/{id}?formula=` | pełny trening |
| `POST` | `/api/workouts` | `{id?, startedAt, endedAt?, routineId?, notes?, isDeload?, applyRoutine?}` → `201` |
| `PUT` | `/api/workouts/{id}` | nadpisuje `startedAt`/`endedAt`/`notes`/`isDeload` (`endedAt: null` = trening trwa) |
| `POST` | `/api/workouts/{id}/finish` | ustawia `endedAt` = teraz, jeśli jeszcze nie ustawione |
| `DELETE` | `/api/workouts/{id}` | soft delete kaskadą (ćwiczenia + serie) |
| `POST` | `/api/workouts/{id}/exercises` | `{id?, exerciseId, orderIndex, notes?}` → `201` |
| `PUT` | `/api/workouts/{id}/exercises/{workoutExerciseId}` | |
| `DELETE` | `/api/workouts/{id}/exercises/{workoutExerciseId}` | |
| `POST` | `/api/workouts/{id}/exercises/{weId}/sets` | `201`, id z serwera |
| `PUT` | `/api/workouts/{id}/exercises/{weId}/sets/{setId}` | **upsert** — klient zna UUID serii z Dexie |
| `DELETE` | `/api/workouts/{id}/exercises/{weId}/sets/{setId}` | |

Wszystkie operacje na ćwiczeniach i seriach zwracają **cały trening** (`WorkoutDetailResponse`) —
front nie musi dosklejać stanu po każdej zmianie ani robić drugiego zapytania po podsumowanie.
Dotyczy to także `DELETE` serii i ćwiczenia treningu: odpowiadają `200` z treningiem, nie `204`.

`PUT .../sets/{setId}` na serii, która ma już tombstone, **zdejmuje `deletedAt` i wskrzesza ten
sam rekord** (to samo `id`, bez duplikatu). Na tym opiera się „Cofnij" po usunięciu serii.

`SaveSetRequest`: `{id?, setIndex, weightKg (0–500), reps (1–100), rpe? (1–10), isWarmup?,
toFailure?, assisted?, completedAt?}`.

```jsonc
// GET /api/workouts/{id}
{ "id": "...", "startedAt": "...", "endedAt": "...", "durationSeconds": 5400,
  "isDeload": false, "notes": null, "routineId": null,
  "exercises": [{ "id": "...", "workoutId": "...", "exerciseId": "...",
                  "exerciseName": "...", "muscleGroup": "...", "equipment": "barbell",
                  "orderIndex": 0, "notes": null, "sets": [ /* SetResponse */ ],
                  "displayVolumeKg": 1140.00, "prEligibleVolumeKg": 500.00, /* ... */ }],
  "displayVolumeKg": 1140.00,      // serie robocze, assisted WLICZONE
  "prEligibleVolumeKg": 500.00,    // serie robocze, assisted WYKLUCZONE
  "workingSetCount": 2,
  "personalRecordsBrokenIn": [     // rekordy pobite W MOMENCIE tej sesji, nie globalne maksima
    { "exerciseId": "...", "exerciseName": "...", "category": "WEIGHT",
      "repRange": null, "value": 105.00, "setId": "...", "workoutId": "..." }] }

// GET /api/workouts
{ "items": [{ "id": "...", "startedAt": "...", "endedAt": "...", "durationSeconds": 5400,
              "isDeload": false, "notes": null, "routineId": null,
              "exerciseCount": 4, "setCount": 16, "volumeKg": 8450.00 }],
  "total": 37, "limit": 30, "offset": 0 }
```

`category`: `WEIGHT` \| `E1RM` \| `SESSION_VOLUME` \| `REP_RANGE` (wtedy wypełnione `repRange`).
Remis **nie** jest pobiciem rekordu (ściśle `>`).

## Waga ciała

| Metoda | Ścieżka | Uwagi |
|---|---|---|
| `GET` | `/api/body-weights?from=2026-01-01&to=2026-09-16` | surowe pomiary |
| `GET` | `/api/body-weights/stats?from&to` | średnie tygodniowe ISO, krocząca 7-dniowa, trend 4-tyg. |
| `PUT` | `/api/body-weights` | **upsert po dacie** — drugi wpis tego samego dnia edytuje istniejący |
| `DELETE` | `/api/body-weights/{id}` | soft delete; po nim można znów dodać wpis z tą samą datą |

```jsonc
// GET /api/body-weights/stats
{ "entries": [{ "id": "...", "measuredOn": "2026-09-01", "weightKg": 80.50, "note": null,
                "updatedAt": "...", "deletedAt": null }],
  "weekly": [{ "year": 2026, "week": 36, "from": "2026-08-31", "to": "2026-09-06",
               "measurementCount": 3, "averageKg": 80.67, "incomplete": false,
               "deltaKg": -0.33, "deltaPercent": -0.41 }],
  "rollingSevenDay": [{ "date": "2026-09-01", "averageKg": 80.50 }],
  "latest": { /* wpis */ },
  "fourWeekTrend": { "fromYear": 2026, "fromWeek": 32, "toYear": 2026, "toWeek": 36,
                     "fromAverageKg": 82.10, "toAverageKg": 80.67,
                     "deltaKg": -1.43, "deltaPercent": -1.74 } }
```

`incomplete: true` = mniej niż 2 pomiary w tygodniu (pokazać, ale wyróżnić wizualnie).

## Dashboard

`GET /api/dashboard?weeks=12&includeDeload=false`

Zakres domyślny: ostatnie 12 tygodni ISO licząc od poniedziałku bieżącego tygodnia.
Agregaty liczy baza (`GROUP BY`/`SUM`, funkcja okna na rekordach), nie pętla po seriach.

```jsonc
{ "from": "...", "to": "...",
  "totals": { "workoutCount": 14, "workingSetCount": 210, "volumeKg": 124500.00 },
  "weeklyVolume": [{ "year": 2026, "week": 38, "from": "2026-09-14", "to": "2026-09-20",
                     "totalKg": 12000.00, "byMuscleGroup": {"klatka piersiowa": 5000.00},
                     "workoutCount": 3, "isDeload": false }],
  "volumeTrend": { "previousKg": 11000.00, "currentKg": 12000.00, "deltaPercent": 9.09 },
  "workoutDays": [{ "date": "2026-09-14", "workoutCount": 1 }],
  "workoutsPerMonth": [{ "month": "2026-09", "workoutCount": 8 }],
  "recentPersonalRecords": [{ "setId": "...", "exerciseId": "...", "exerciseName": "...",
                              "weightKg": 105.00, "reps": 5, "achievedAt": "...", "workoutId": "..." }],
  "bodyWeight": { /* jak GET /api/body-weights/stats */ } }
```

`volumeTrend` domyślnie **pomija tygodnie deload** (tydzień po deloadzie porównuje się do
ostatniego tygodnia nie-deload przed nim); `includeDeload=true` wyłącza to zachowanie.
`recentPersonalRecords` to serie, które w momencie wykonania pobiły dotychczasowy rekord ciężaru
danego ćwiczenia (rozgrzewka i `assisted` wykluczone).

## Synchronizacja offline (Dexie)

`POST /api/sync` — jedno wywołanie robi push i pull.

```jsonc
// request
{ "since": "2026-09-16T12:00:00Z",     // null przy pierwszym uruchomieniu (pełny zaciąg)
  "changes": {                          // dowolne pole można pominąć; pusty obiekt = sam pull
    "exercises": [], "routines": [], "routineItems": [],
    "workouts": [], "workoutExercises": [], "sets": [], "bodyWeights": [] } }

// response
{ "serverTime": "2026-09-16T12:34:56Z",              // zapisz jako `since` do następnego razu
  "applied": { "workouts": 1, "sets": 12 },
  "rejected": [{ "table": "sets", "id": "...", "reason": "starsza wersja niż na serwerze (last-write-wins)" }],
  "changes": { /* ta sama struktura co w request */ } }
```

Rekordy mają kształt kolumn tabeli w camelCase, **bez `userId`**, z obowiązkowym `updatedAt`
i opcjonalnym `deletedAt` (tombstone).

Reguły rozstrzygania:

1. **Last-write-wins po `updatedAt`, ściśle `>`.** Remis wygrywa serwer.
2. `updatedAt` z przyszłości jest przycinane do czasu serwera — inaczej telefon z przestawionym
   zegarem wygrywałby każdy kolejny konflikt.
3. Kolejność stosowania (wymuszona kluczami obcymi): `exercises` → `routines` → `routineItems` →
   `workouts` → `workoutExercises` → `sets`; `bodyWeights` niezależnie.
4. **Jeden zły rekord nie wywraca paczki** — wraca w `rejected` z powodem, reszta się zapisuje.
5. Rekordy odrzucone wracają w `changes` w wersji serwerowej (nawet jeśli ich `updatedAt` jest
   starsze niż `since`), żeby klient zbiegł się bez dodatkowej rundy.
6. Ćwiczenia globalne (`userId: null`) są tylko do odczytu — próba ich nadpisania to odrzucenie.
7. Konflikt „jeden żywy wpis wagi na dzień" rozstrzyga LWW: przegrany wpis dostaje tombstone
   i wraca w `changes`.
8. `serverTime` to znacznik **początku** transakcji. Przy kolejnym `since` bezpiecznie jest odjąć
   niewielki margines (np. 1–5 min), żeby nie przegapić zapisu z równolegle trwającej sesji
   innego urządzenia.

## Zdrowie

`GET /actuator/health` → `{"status":"UP"}` (bez szczegółów, bez tokenu). Dla probe'ów
platformy: `/actuator/health/liveness`, `/actuator/health/readiness`.
