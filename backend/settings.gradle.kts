plugins {
    // Bez tego Gradle nie potrafi sam pobrać JDK 26 wymaganego przez toolchain
    // w build.gradle.kts -- na maszynie bez lokalnie zainstalowanego JDK 26
    // build wywala się komunikatem "Toolchain download repositories have not
    // been configured". Z tym pluginem pobiera go raz do ~/.gradle/jdks.
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

rootProject.name = "easy-gym-backend"
