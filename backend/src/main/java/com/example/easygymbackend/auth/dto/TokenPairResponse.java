package com.example.easygymbackend.auth.dto;

public record TokenPairResponse(
        String accessToken,
        String refreshToken,
        long expiresInSeconds
) {
}
