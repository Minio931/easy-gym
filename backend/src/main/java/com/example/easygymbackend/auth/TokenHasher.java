package com.example.easygymbackend.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * Refresh tokeny trzymamy w bazie jako hash, nigdy jako surową wartość --
 * ten sam powód co bcrypt dla haseł: wyciek bazy nie powinien od razu
 * dawać atakującemu działających tokenów.
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
            throw new IllegalStateException("SHA-256 niedostępny w JVM", e);
        }
    }

}
