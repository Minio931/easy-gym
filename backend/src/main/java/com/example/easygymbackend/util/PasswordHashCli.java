package com.example.easygymbackend.util;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/**
 * Zwykła klasa z main(), NIE komponent Springa -- odpalana osobno przez
 * Gradle task `generatePasswordHash` (patrz build.gradle.kts), nie startuje
 * kontekstu aplikacji. Hasło podane w argumencie trafia tylko do stdout jako
 * hash, do wklejenia w migracji seedującej konta (V5).
 */
public final class PasswordHashCli {

    private PasswordHashCli() {
    }

    public static void main(String[] args) {
        if (args.length != 1 || args[0].isBlank()) {
            System.err.println("Użycie: ./gradlew generatePasswordHash -Ppassword=<haslo>");
            System.exit(1);
        }

        String hash = new BCryptPasswordEncoder().encode(args[0]);
        System.out.println(hash);
    }

}
