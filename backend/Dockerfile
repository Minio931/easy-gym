# Wieloetapowy build -- obraz uruchomieniowy nie zawiera JDK/Gradle'a,
# tylko JRE + gotowy jar (mniejszy obraz, mniejsza powierzchnia ataku).

FROM eclipse-temurin:26-jdk AS build
WORKDIR /app

# Najpierw same pliki Gradle -- warstwa z zależnościami cache'uje się
# między buildami dopóki nie zmienia się build.gradle.kts.
COPY gradlew gradlew.bat ./
COPY gradle gradle
COPY build.gradle.kts settings.gradle.kts ./
RUN chmod +x gradlew && ./gradlew --no-daemon dependencies > /dev/null 2>&1 || true

COPY src src
RUN ./gradlew --no-daemon bootJar -x test

FROM eclipse-temurin:26-jre AS runtime
WORKDIR /app

RUN groupadd --system spring && useradd --system --gid spring spring
USER spring:spring

COPY --from=build /app/build/libs/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
