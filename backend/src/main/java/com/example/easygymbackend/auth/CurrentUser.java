package com.example.easygymbackend.auth;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.UUID;

/**
 * Entry point for "who is calling" for all future domain controllers/services.
 * Throws if invoked outside a secured request -- that means the endpoint forgot
 * to require authentication, i.e. a configuration bug, not a situation to be
 * silently ignored.
 */
public final class CurrentUser {

    private CurrentUser() {
    }

    public static AuthenticatedUser get() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AuthenticatedUser user)) {
            throw new IllegalStateException(
                    "No authenticated user in SecurityContext -- endpoint must require authentication");
        }
        return user;
    }

    public static UUID id() {
        return get().userId();
    }

}
