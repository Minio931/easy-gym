package com.example.easygymbackend.admin.dto;

import java.time.Instant;
import java.util.UUID;

public record CreateUserResponse(
        UUID id,
        String login,
        Instant createdAt
) {
}
