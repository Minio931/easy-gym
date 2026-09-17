# --- build ---------------------------------------------------------------
# JDK 26, bo tyle wymaga toolchain w build.gradle.kts. Gradle jest pobierany
# przez wrappera (gradle/wrapper/gradle-wrapper.properties), więc wersja
# builda w kontenerze jest ta sama co lokalnie.
FROM eclipse-temurin:26-jdk-alpine AS build

WORKDIR /build

# Bez składni BuildKit (--mount=type=cache) -- obraz ma się budować także
# starym builderem (DOCKER_BUILDKIT=0), na maszynie bez buildx.
# Najpierw sam opis builda -- dzięki temu warstwa z zależnościami nie
# przebudowuje się przy każdej zmianie w src/.
COPY gradlew ./
COPY gradle gradle
COPY settings.gradle.kts build.gradle.kts ./
# `|| true`, bo pusty projekt bez konfiguracji `dependencies` potrafi zwrócić
# błąd, a chodzi wyłącznie o ściągnięcie zależności do warstwy cache.
RUN ./gradlew --no-daemon dependencies --quiet || true

COPY src src
# Testy NIE idą przez obraz: wymagają Testcontainers, czyli Dockera w Dockerze.
# Odpala je CI/`./gradlew test` na hoście, zanim powstanie obraz.
RUN ./gradlew --no-daemon bootJar

# --- runtime -------------------------------------------------------------
FROM eclipse-temurin:26-jre-alpine AS runtime

RUN addgroup -S easygym && adduser -S -G easygym easygym

WORKDIR /app
COPY --from=build /build/build/libs/app.jar app.jar

USER easygym
EXPOSE 8080

# -XX:MaxRAMPercentage zamiast -Xmx: limit pamięci ustawia platforma
# (docker run -m / plan hostingu), a JVM ma się do niego dostosować.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
    CMD wget --quiet --spider http://127.0.0.1:8080/actuator/health || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
