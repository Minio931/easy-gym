package com.example.easygymbackend.auth;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.UUID;

/**
 * Punkt wejścia do "kto woła" dla wszystkich przyszłych kontrolerów/serwisów
 * domenowych. Rzuca, jeśli wywołane poza zabezpieczonym requestem -- to znaczy
 * że endpoint zapomniał wymagać uwierzytelnienia, czyli błąd konfiguracji, nie
 * sytuacja do cichego ignorowania.
 */
public final class CurrentUser {

    private CurrentUser() {
    }

    public static AuthenticatedUser get() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AuthenticatedUser user)) {
            throw new IllegalStateException(
                    "Brak zalogowanego użytkownika w SecurityContext -- endpoint musi wymagać uwierzytelnienia");
        }
        return user;
    }

    public static UUID id() {
        return get().userId();
    }

}
