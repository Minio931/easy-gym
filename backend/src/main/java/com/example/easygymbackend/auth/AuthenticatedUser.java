package com.example.easygymbackend.auth;

import java.util.UUID;

/**
 * Principal ustawiany w SecurityContext przez {@link JwtAuthenticationFilter}.
 * userId() to jedyne źródło prawdy o tym, kto woła endpoint -- każdy serwis
 * operujący na danych per-user filtruje repozytoria po tej wartości, nigdy
 * po id przyjętym z body/query requestu.
 */
public record AuthenticatedUser(UUID userId, String login) {
}
