package com.example.easygymbackend.auth;

import java.util.UUID;

/**
 * Principal set in SecurityContext by {@link JwtAuthenticationFilter}.
 * userId() is the single source of truth for who is calling the endpoint --
 * every service operating on per-user data filters repositories by this value,
 * never by an id taken from the request body/query.
 */
public record AuthenticatedUser(UUID userId, String login) {
}
