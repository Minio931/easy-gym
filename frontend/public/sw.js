/*
 * Service worker: powłoka aplikacji offline.
 *
 * ZAKRES: wyłącznie statyczna powłoka (HTML tras, chunki JS/CSS, fonty,
 * ikony). Danych NIE cache'uje w ogóle — od tego jest Dexie. Cache'owanie
 * odpowiedzi API dałoby drugą, niewidoczną kopię treningu, która nie zna
 * `updatedAt` ani `deletedAt` i po odzyskaniu sieci pokazywałaby serie
 * skasowane na drugim urządzeniu. Jedna warstwa offline na dane, nie dwie.
 *
 * Dlatego poniżej jest jawna lista tego, czego SW NIE dotyka: `/api/*`,
 * `/actuator/*` i wszystko, co nie jest tym originem (backend stoi pod innym
 * adresem, a `POST` i tak nie podlega cache'owaniu).
 */

const VERSION = "v1";
const SHELL_CACHE = `easy-gym-shell-${VERSION}`;
const ASSET_CACHE = `easy-gym-assets-${VERSION}`;

/** Trasy powłoki. Bez `/` — to tylko przekierowanie na `/pulpit`. */
const SHELL_ROUTES = [
  "/pulpit",
  "/trening",
  "/historia",
  "/waga",
  "/ustawienia",
  "/logowanie",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // `reload` omija cache HTTP przeglądarki: przy aktualizacji apki chcemy
      // świeży HTML, a nie ten sam, który już mamy.
      await Promise.allSettled(
        SHELL_ROUTES.map((route) => cache.add(new Request(route, { cache: "reload" }))),
      );
      // Nowa wersja wchodzi od razu. Apka jest jednoosobowa i nie ma stanu,
      // który dwie wersje musiałyby uzgadniać -- czekanie na zamknięcie
      // wszystkich kart dawałoby tylko „czemu poprawka nie działa".
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.filter((name) => !keep.has(name)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

function isCacheable(request) {
  if (request.method !== "GET") {
    return false;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return false;
  }
  // Dane i healthcheck idą zawsze do sieci -- patrz nagłówek pliku.
  return !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/actuator/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!isCacheable(request)) {
    return;
  }

  const url = new URL(request.url);

  // Zasoby z hashem w nazwie są niezmienne: cache-first, bez odpytywania sieci.
  // To tu siedzą fonty (`next/font` hostuje je lokalnie), więc offline apka ma
  // własną typografię, a nie systemową zastępczą.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // Nawigacje: sieć najpierw (świeży HTML), cache jako siatka bezpieczeństwa.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit !== undefined) {
    return hit;
  }
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit !== undefined) {
      return hit;
    }
    // Trasa, której nigdy nie odwiedzono: pokazujemy pulpit zamiast błędu
    // przeglądarki. Guard tras i tak przeniesie, dokąd trzeba.
    const fallback = await cache.match("/pulpit");
    if (fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}
