# --- zależności ----------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build ---------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY . .

# UWAGA: NEXT_PUBLIC_* jest wstrzykiwane do bundla na etapie BUILDU, nie
# startu kontenera. Zmiana adresu API = przebudowa obrazu (albo build arg w
# docker compose, patrz docker-compose.yml).
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

# public/ jeszcze nie istnieje (dojdzie z manifestem PWA w etapie 5) --
# tworzymy pusty, żeby COPY w warstwie runtime miał co kopiować.
RUN mkdir -p public && npm run build

# --- runtime -------------------------------------------------------------
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# output: "standalone" w next.config.ts pakuje serwer razem z potrzebną
# częścią node_modules -- obraz nie musi wozić całego katalogu zależności.
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
    CMD wget --quiet --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
