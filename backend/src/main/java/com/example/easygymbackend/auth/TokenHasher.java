package com.example.easygymbackend.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * Refresh tokens are stored in the database as a hash, never as the raw value --
 * same reason as bcrypt for passwords: a database leak should not immediately
 * give the attacker working tokens.
 */
final class TokenHasher {

    private TokenHasher() {
    }

    static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available in JVM", e);
        }
    }

}
