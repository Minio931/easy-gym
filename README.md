# easy-gym

PWA do śledzenia treningu siłowego i masy ciała. Monorepo:

- `backend/` — Spring Boot (Java) + Postgres. REST API, gotowe (wszystkie etapy z promptu projektowego zrobione).
- `frontend/` — Next.js PWA. Osobny zespół/agent, w budowie.

Ten plik: jak odpalić backend lokalnie, żeby developować frontend przeciwko realnemu API. Pełna dokumentacja backendu (endpointy, decyzje projektowe, konwencje): [`backend/CLAUDE.md`](backend/CLAUDE.md).

## Wymagania

Tylko **Docker** + **Docker Compose**. Nie musisz mieć zainstalowanej Javy ani Gradle'a — obraz backendu buduje się sam w kontenerze.

## Uruchomienie

```bash
cd backend
docker compose up -d --build
```

To odpala dwa kontenery:
- `easy-gym-postgres` — Postgres 16, dane trzymane w wolumenie (przeżywają restart)
- `easy-gym-backend` — API na `localhost:8080`, migracje Flyway aplikują się automatycznie przy starcie

Sprawdź, że żyje:

```bash
curl -i localhost:8080/api/auth/login -X POST -H "Content-Type: application/json" -d '{"login":"x","password":"x"}'
```

Spodziewany wynik: `401` z `{"error":"Nieprawidłowy login lub hasło"}` — to znaczy, że serwer odpowiada poprawnie (nie że masz jakiekolwiek konto).

Restart po zmianach w kodzie backendu:

```bash
docker compose up -d --build
```

Logi:

```bash
docker compose logs -f backend
```

Zatrzymanie (dane w Postgresie zostają):

```bash
docker compose down
```

## Zakładanie konta

Backend nie ma self-service rejestracji — konta zakłada się przez chroniony endpoint admina (sekcja 1 promptu projektowego: dwóch znanych użytkowników, bez publicznej rejestracji):

```bash
curl -X POST localhost:8080/api/admin/users \
  -H "X-Bootstrap-Secret: dev-only-bootstrap-secret-change-me" \
  -H "Content-Type: application/json" \
  -d '{"login":"twoj-login","password":"haslo-min-8-znakow"}'
```

Sekret (`dev-only-bootstrap-secret-change-me`) to developerski default z `backend/docker-compose.yml` — działa od razu lokalnie, nie zmieniaj go, chyba że wiesz że robisz deploy produkcyjny (wtedy patrz zmienne środowiskowe niżej).

Logowanie:

```bash
curl -X POST localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"twoj-login","password":"haslo-min-8-znakow"}'
```

Zwraca:
```json
{"accessToken": "...", "refreshToken": "...", "expiresInSeconds": 900}
```

`accessToken` (JWT, ważny 15 min) idzie w nagłówku do wszystkich endpointów poza `/api/auth/**` i `/api/admin/**`:

```
Authorization: Bearer <accessToken>
```

`refreshToken` (ważny 30 dni) — `POST /api/auth/refresh` z `{"refreshToken": "..."}` wymienia go na nową parę (stary refresh token jednorazowy, rotuje się przy każdym użyciu).

## Skrót API

Pełny opis kształtu requestów/odpowiedzi: [`backend/CLAUDE.md`](backend/CLAUDE.md) (sekcja "Decyzje architektoniczne" per etap + "Struktura").

| Endpoint | Co robi |
|---|---|
| `POST /api/auth/login` \| `/refresh` \| `/logout` | logowanie, odświeżanie, wylogowanie |
| `POST /api/admin/users` | zakładanie konta (sekret, nie JWT) |
| `GET /api/exercises?search=` \| `POST /api/exercises` | wyszukiwanie ćwiczeń (globalne + własne) / dodanie własnego |
| `GET /api/exercises/{id}/progress?formula=EPLEY\|BRZYCKI` | główny wykres ćwiczenia + aktualne PR |
| `POST /api/workouts` \| `GET/PATCH /api/workouts/{id}` \| `GET /api/workouts` | start/szczegóły+koniec/lista treningów |
| `POST /api/workouts/{id}/exercises` | dodanie ćwiczenia do treningu |
| `POST /api/workout-exercises/{id}/sets` \| `PATCH/DELETE /api/sets/{id}` | dodanie/edycja/usunięcie serii |
| `POST /api/body-weights` \| `PATCH/DELETE /api/body-weights/{id}` \| `GET /api/body-weights` | wpisy wagi ciała + średnie tygodniowe |
| `POST /api/sync` \| `GET /api/sync?since=` | batch sync dla trybu offline (Dexie) |
| `GET /api/dashboard?from=&formula=` | objętość tygodniowa/grupa, kalendarz treningów, ostatnie PR |
| `GET /api/export/xlsx?from=&to=&exerciseIds=&workingSetsOnly=&formula=` | eksport do Excela (6 arkuszy, wykresy) |

Wszystkie `id` (workoutów, serii, ćwiczeń itd.) generuje **klient**, nie serwer — offline-first, patrz `backend/CLAUDE.md`.

## CORS

Domyślnie dozwolony origin to `http://localhost:3000` (domyślny port `next dev`). Jeśli frontend startuje na innym porcie, ustaw zmienną `CORS_ALLOWED_ORIGINS` (patrz niżej) przed `docker compose up`.

## Zmienne środowiskowe

Wszystkie mają sensowne developerskie defaulty — nie musisz nic ustawiać do lokalnej pracy. Do zmiany tylko dla realnego deployu:

| Zmienna | Opis | Default (dev) |
|---|---|---|
| `JWT_SECRET` | sekret HMAC do podpisywania JWT | słaby, tylko dev |
| `ADMIN_BOOTSTRAP_SECRET` | sekret do zakładania kont | słaby, tylko dev |
| `CORS_ALLOWED_ORIGINS` | dozwolone originy (comma-separated) | `http://localhost:3000` |
| `DB_URL` / `DB_USERNAME` / `DB_PASSWORD` | połączenie do Postgresa | wskazuje na kontener `postgres` z tego samego compose |

Ustawiane przed `docker compose up`, np.:

```bash
CORS_ALLOWED_ORIGINS=http://localhost:3001 docker compose up -d --build
```

## Coś nie działa?

`backend/CLAUDE.md` ma sekcję o typowych pułapkach tego konkretnego stosu (Spring Boot 4 + Jackson 3 mają inne pakiety niż w tutorialach pisanych pod Boot 3, kilka nieoczywistych zachowań Postgres/JDBC) — warto tam zajrzeć, zanim zgadniesz że to Twój kod.
