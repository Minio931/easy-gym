# easy-gym — repozytorium

Monorepo dla PWA do śledzenia treningu siłowego i masy ciała. Dwa niezależne projekty w jednym repo, bez współdzielonego build toolingu:

- `backend/` — Spring Boot (Java), REST API + Postgres. **To jest zakres tej dokumentacji i tej sesji pracy.** Szczegóły: [`backend/CLAUDE.md`](backend/CLAUDE.md).
- `frontend/` — Next.js (PWA), własny zespół/agent. Nie modyfikować z tej sesji bez wyraźnej prośby — traktuj jako cudzy kod.

Kontrakt między nimi: REST API opisany w `backend/CLAUDE.md` (endpointy, kształt JSON, kody błędów) plus endpoint synchronizacji dla kolejki offline (Dexie po stronie frontu). Każda zmiana kształtu odpowiedzi API jest zmianą kontraktu — informuj o niej wprost, nie zmieniaj po cichu.

**Backend ustala kontrakt, nie odwrotnie.** Frontend startuje dopiero jak backend ma gotowe API — nie czekaj z decyzjami projektowymi backendu na to, "czego front będzie potrzebował". Projektuj kształt endpointów/DTO na podstawie promptu projektowego i zdrowego rozsądku, buduj, dokumentuj w `backend/CLAUDE.md`. Front dostosuje się do tego, co tu powstanie.

Pełny prompt projektowy (stack, model danych, etapy) został dostarczony przez użytkownika na starcie projektu i jest realizowany etapami — nie w jednej odpowiedzi. Aktualny postęp etapów backendowych: patrz `backend/CLAUDE.md` → sekcja "Postęp etapów".
