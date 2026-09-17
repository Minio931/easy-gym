# easy-gym — repozytorium

Monorepo dla PWA do śledzenia treningu siłowego i masy ciała. Dwa niezależne projekty w jednym repo, bez współdzielonego build toolingu:

- `backend/` — Spring Boot (Java), REST API + Postgres. **To jest zakres tej dokumentacji i tej sesji pracy.** Szczegóły: [`backend/CLAUDE.md`](backend/CLAUDE.md).
- `frontend/` — Next.js (PWA), własny zespół/agent. Nie modyfikować z tej sesji bez wyraźnej prośby — traktuj jako cudzy kod.

Kontrakt między nimi: **[`backend/API.md`](backend/API.md)** — wszystkie endpointy, kształty JSON, kody błędów i reguły synchronizacji kolejki offline (Dexie po stronie frontu). Każda zmiana kształtu odpowiedzi API jest zmianą kontraktu — informuj o niej wprost, nie zmieniaj po cichu.

Uruchamianie (Docker: cały stos jedną komendą; albo lokalnie backend + front osobno), zmienne środowiskowe, testy i deploy: **[`README.md`](README.md)**. Pliki obsługujące stos: `docker-compose.yml` (Postgres + API + PWA), `docker-compose.prod.yml` (API + PWA, baza zewnętrzna), `backend/Dockerfile`, `frontend/Dockerfile`, `.env.example`.

Pełny prompt projektowy (stack, model danych, etapy) został dostarczony przez użytkownika na starcie projektu i jest realizowany etapami — nie w jednej odpowiedzi. Aktualny postęp etapów backendowych: patrz `backend/CLAUDE.md` → sekcja "Postęp etapów".
