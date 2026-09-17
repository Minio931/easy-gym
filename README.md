# easy-gym

PWA do śledzenia treningu siłowego i masy ciała. Monorepo, dwa niezależne projekty:

| Katalog | Co to jest | Stack |
|---|---|---|
| `backend/` | REST API + baza | Spring Boot 4 (Java 26), Postgres 16, Flyway, JWT |
| `frontend/` | aplikacja (PWA) | Next.js 16 (App Router), TypeScript, Tailwind |

Kontrakt API: [`backend/API.md`](backend/API.md). Decyzje architektoniczne backendu: [`backend/CLAUDE.md`](backend/CLAUDE.md).

---

## 1. Szybki start (Docker — cały stos)

Wymagania: Docker 24+ z `docker compose`. Nic poza tym — JDK i Node są tylko w obrazach.

```bash
cp .env.example .env
# wygeneruj sekrety i wklej do .env (POSTGRES_PASSWORD, JWT_SECRET, ADMIN_BOOTSTRAP_SECRET)
openssl rand -base64 48

docker compose up -d --build
```

Po chwili (backend czeka, aż Postgres odpowie na `pg_isready`, potem sam aplikuje migracje Flyway):

| Adres | Co tam jest |
|---|---|
| http://localhost:3000 | frontend |
| http://localhost:8080 | API |
| http://localhost:8080/actuator/health | healthcheck (`{"status":"UP"}`) |
| localhost:5432 | Postgres (tylko z localhosta) |

Sprawdzenie, że wszystko wstało:

```bash
docker compose ps           # trzy usługi w stanie "healthy"
curl -s localhost:8080/actuator/health
```

### Założenie kont

Nie ma rejestracji — konta zakłada się endpointem admina, sekretem z `.env`:

```bash
curl -X POST localhost:8080/api/admin/users \
  -H "X-Bootstrap-Secret: $ADMIN_BOOTSTRAP_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"login":"Minio","password":"haslo-min-8-znakow"}'
```

`201` = konto gotowe. `403` = zły sekret, `409` = login zajęty, `400` = hasło krótsze niż 8 znaków.
Potem logujesz się w aplikacji na http://localhost:3000.

### Codzienna obsługa

```bash
docker compose logs -f backend      # logi API
docker compose restart backend
docker compose down                 # stop (dane zostają w wolumenie)
docker compose down -v              # stop + SKASOWANIE bazy
docker compose build frontend       # po zmianie NEXT_PUBLIC_API_URL w .env (patrz niżej)
```

---

## 2. Development bez Dockera (poza bazą)

Tak wygodniej pracuje się nad kodem — hot reload frontu i `bootRun` backendu, w kontenerze tylko Postgres.

```bash
# 1. baza
cd backend && docker compose up -d      # Postgres na localhost:5432, baza/user/hasło: easy_gym

# 2. backend (JDK nie jest potrzebny w systemie — Gradle sam pobierze JDK 26)
./gradlew bootRun                       # http://localhost:8080

# 3. frontend
cd ../frontend
cp .env.example .env.local              # NEXT_PUBLIC_API_URL=http://localhost:8080
npm install
npm run dev                             # http://localhost:3000
```

Domyślne wartości w `backend/src/main/resources/application.yaml` są dobrane pod ten wariant — bez żadnych zmiennych środowiskowych backend wstaje na lokalnym Postgresie z developerskim (słabym, celowo) `JWT_SECRET` i `ADMIN_BOOTSTRAP_SECRET`.

### Testy

```bash
cd backend && ./gradlew test            # wymaga działającego Dockera (Testcontainers)
cd backend && ./gradlew test --tests "com.example.easygymbackend.metrics.*"   # sekundy, bez Dockera
cd frontend && npm test                 # Vitest
cd frontend && npm run typecheck && npm run lint
cd frontend && npm run test:e2e         # Playwright -- wymaga żywego backendu i frontu, patrz niżej
```

Testy integracyjne odpalają prawdziwego Postgresa w kontenerze (`postgres:16-alpine`), nie H2 — cała izolacja danych per-user jest sprawdzana na tej samej bazie, co produkcja.

**E2E potrzebują żywego stosu**, bo klikają po uruchomionej apce przeciwko prawdziwemu API:

```bash
# front pod :3001 (Playwright go NIE startuje -- celowo, patrz playwright.config.ts)
cd frontend && npm run dev -- -p 3001
# backend pod adresem z PLAYWRIGHT_API_URL (domyślnie :8081)
cd frontend && PLAYWRIGHT_API_URL=http://localhost:8080 npm run test:e2e
```

Dwa warunki, o które najłatwiej się potknąć:
- **oba konta** (`Minio` i `Wojtur`) muszą istnieć w bazie tego backendu — scenariusze izolacji
  logują się na drugie konto i bez niego sypią się na `401`, co wygląda jak błąd apki;
- backend musi mieć `http://localhost:3001` w `CORS_ALLOWED_ORIGINS`, inaczej każde żądanie
  z testów kończy się preflightem `403`.

---

## 3. Zmienne środowiskowe

Wszystkie są opisane w [`.env.example`](.env.example). Najważniejsze:

| Zmienna | Dotyczy | Uwagi |
|---|---|---|
| `POSTGRES_PASSWORD` | compose (lokalna baza) | wymagane, bez domyślnej wartości |
| `DB_URL` / `DB_USERNAME` / `DB_PASSWORD` | backend | JDBC do bazy; w `docker-compose.yml` składane automatycznie z `POSTGRES_*` |
| `JWT_SECRET` | backend | min. 32 losowe bajty. Zmiana = natychmiastowe wylogowanie wszystkich |
| `ADMIN_BOOTSTRAP_SECRET` | backend | sekret do `POST /api/admin/users`, nie trafia do frontu |
| `CORS_ALLOWED_ORIGINS` | backend | originy frontu po przecinku, np. `https://easy-gym.example.com` |
| `NEXT_PUBLIC_API_URL` | frontend | **wchodzi do bundla w czasie builda**, nie startu kontenera |
| `BACKEND_PORT` / `FRONTEND_PORT` / `POSTGRES_PORT` | compose | porty na hoście |

> `NEXT_PUBLIC_*` jest wstrzykiwane przez Next.js na etapie `npm run build`. Zmiana adresu API wymaga
> `docker compose build frontend`, samo `restart` nic nie da.

---

## 4. Deploy

Obrazy są produkcyjne od razu: multi-stage build, użytkownik nie-root, healthcheck, limit pamięci JVM
z limitu kontenera (`-XX:MaxRAMPercentage=75`), graceful shutdown.

### Wariant A — VPS + managed Postgres (rekomendowany)

Baza zewnętrzna (Neon / Railway / RDS), w stosie tylko API i frontend:

```bash
cp .env.example .env.prod      # wypełnij DB_URL, DB_USERNAME, DB_PASSWORD, sekrety,
                               # CORS_ALLOWED_ORIGINS i NEXT_PUBLIC_API_URL (adresy publiczne!)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Oba serwisy słuchają wtedy tylko na `127.0.0.1` — publiczny port i TLS robi reverse proxy na hoście.
Minimalny Caddyfile:

```
easy-gym.example.com {
    reverse_proxy 127.0.0.1:3000
}
api.easy-gym.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Przy Neonie pamiętaj o `?sslmode=require` w `DB_URL`:
`jdbc:postgresql://ep-xxx.eu-central-1.aws.neon.tech/easy_gym?sslmode=require`

### Wariant B — jedna maszyna, wszystko w compose

`docker-compose.yml` z sekcji 1, uruchomiony na serwerze, z `.env` wypełnionym produkcyjnymi
wartościami. Kopia zapasowa bazy:

```bash
docker compose exec postgres pg_dump -U easy_gym easy_gym | gzip > backup-$(date +%F).sql.gz
```

### Wariant C — platforma PaaS (Railway / Render / Fly.io)

Każdy katalog ma samodzielny `Dockerfile` — wskazujesz `backend/` i `frontend/` jako dwie usługi,
ustawiasz zmienne z sekcji 3, a `NEXT_PUBLIC_API_URL` jako **build arg** frontu.
Healthcheck backendu: `GET /actuator/health` (dla probe'ów k8s: `/actuator/health/liveness`
i `/actuator/health/readiness`).

### Lista kontrolna przed wystawieniem na świat

- [ ] `JWT_SECRET` i `ADMIN_BOOTSTRAP_SECRET` losowe, różne od developerskich z `application.yaml`
- [ ] `CORS_ALLOWED_ORIGINS` = dokładny adres frontu (bez `*`)
- [ ] HTTPS przed backendem — hasła i tokeny lecą w body/nagłówkach
- [ ] port Postgresa niewystawiony publicznie
- [ ] konta założone i sprawdzone (`/api/auth/login` zwraca parę tokenów)
- [ ] backup bazy (Neon robi to sam; przy własnym Postgresie — `pg_dump` w cronie)

---

## 5. Migracje bazy

Flyway aplikuje się sam przy starcie backendu (`spring.flyway.enabled: true`), także w kontenerze.
Zasada: **nigdy nie edytuj już zastosowanej migracji** — nowa zmiana to nowy plik `V5__...` w
`backend/src/main/resources/db/migration/`. Hibernate ma `ddl-auto: validate`, więc rozjazd encji ze
schematem wywali aplikację przy starcie, zamiast po cichu zmienić bazę.

Podgląd stanu:

```bash
docker compose exec postgres psql -U easy_gym -d easy_gym -c "\dt"
docker compose exec postgres psql -U easy_gym -d easy_gym -c "SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank;"
```

---

## 6. Problemy

**`docker compose build` → `docker-buildx: no such file or directory`**
Na maszynie nie ma wtyczki buildx (np. rozjechana integracja Docker Desktop z WSL). Obrazy zbudujesz
starym builderem, Dockerfile'e są go świadome (bez składni `--mount=type=cache`):

```bash
DOCKER_BUILDKIT=0 docker build -t easy-gym-backend:local ./backend
DOCKER_BUILDKIT=0 docker build --build-arg NEXT_PUBLIC_API_URL=http://localhost:8080 \
    -t easy-gym-frontend:local ./frontend
docker compose up -d --no-build
```

**`Bind for 0.0.0.0:5432 failed: port is already allocated`**
Masz już Postgresa na hoście (albo `backend/docker-compose.yml` z sekcji 2 — te dwa stosy nie mogą
działać jednocześnie na tym samym porcie). Ustaw `POSTGRES_PORT=55432` w `.env`.

**`Cannot find a Java installation ... matching languageVersion=26`**
To był błąd sprzed konfiguracji toolchainów — `settings.gradle.kts` ma teraz plugin
`foojay-resolver-convention`, więc Gradle pobiera JDK 26 sam przy pierwszym buildzie.

**Frontend gada z API pod złym adresem**
`NEXT_PUBLIC_API_URL` jest wkompilowany w bundle. Po zmianie: `docker compose build frontend`.

**Apka nie instaluje się jako PWA / nie działa offline po instalacji**
Service worker rejestruje się **tylko w buildzie produkcyjnym** (`npm run build && npm start` albo
obraz dockerowy). W `next dev` jest świadomie wyłączony: nazwy chunków zmieniają się przy każdym
zapisie, a SW trzymający je w cache potrafi podać stary chunk do nowego HTML-a. Offline samych
danych (trening bez zasięgu) działa w obu trybach, bo to Dexie, nie service worker.

**Po wdrożeniu nowej wersji apka pokazuje starą**
Service worker wchodzi od razu (`skipWaiting` + `clients.claim`), ale otwarta karta dokończy się na
starych zasobach. Wystarczy przeładowanie. Jeśli coś zostało na trwałe: DevTools → Application →
Service Workers → Unregister + Clear site data. Uwaga: „Clear site data" kasuje też Dexie, czyli
**niezsynchronizowane treningi** — najpierw upewnij się, że pigułka nie pokazuje „w kolejce".

**Testy backendu nie startują**
Testcontainers potrzebuje działającego Dockera. Same testy `metrics` są czystym JUnitem i działają
bez niego (`./gradlew test --tests "com.example.easygymbackend.metrics.*"`).
