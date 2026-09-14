package com.example.easygymbackend.auth;

import com.example.easygymbackend.auth.dto.TokenPairResponse;
import com.example.easygymbackend.config.JwtProperties;
import com.example.easygymbackend.user.User;
import com.example.easygymbackend.user.UserRepository;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final JwtProperties jwtProperties;
    private final SecureRandom secureRandom = new SecureRandom();

    public AuthService(
            UserRepository userRepository,
            RefreshTokenRepository refreshTokenRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            JwtProperties jwtProperties
    ) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.jwtProperties = jwtProperties;
    }

    @Transactional
    public TokenPairResponse login(String login, String rawPassword) {
        User user = userRepository.findByLogin(login)
                .orElseThrow(() -> new BadCredentialsException("Nieprawidłowy login lub hasło"));

        if (!passwordEncoder.matches(rawPassword, user.getPasswordHash())) {
            throw new BadCredentialsException("Nieprawidłowy login lub hasło");
        }

        return issueTokens(user);
    }

    /**
     * Rotacja refresh tokenu: stary rekord jest oznaczany jako revoked przy
     * każdym użyciu, więc powtórne użycie tego samego surowego tokenu (np. po
     * jego kradzieży i użyciu przez obie strony) już nie przejdzie -- druga
     * próba trafia na revokedAt != null i kończy się 401.
     */
    @Transactional
    public TokenPairResponse refresh(String rawRefreshToken) {
        String hash = TokenHasher.sha256Hex(rawRefreshToken);
        RefreshToken existing = refreshTokenRepository.findByTokenHashAndRevokedAtIsNull(hash)
                .filter(rt -> rt.getExpiresAt().isAfter(Instant.now()))
                .orElseThrow(() -> new BadCredentialsException("Refresh token nieprawidłowy lub wygasły"));

        existing.setRevokedAt(Instant.now());
        refreshTokenRepository.save(existing);

        User user = userRepository.findById(existing.getUserId())
                .orElseThrow(() -> new BadCredentialsException("Użytkownik nie istnieje"));

        return issueTokens(user);
    }

    @Transactional
    public void logout(String rawRefreshToken) {
        String hash = TokenHasher.sha256Hex(rawRefreshToken);
        refreshTokenRepository.findByTokenHash(hash).ifPresent(rt -> {
            rt.setRevokedAt(Instant.now());
            refreshTokenRepository.save(rt);
        });
    }

    private TokenPairResponse issueTokens(User user) {
        String accessToken = jwtService.generateAccessToken(user.getId(), user.getLogin());
        String rawRefreshToken = generateRawRefreshToken();

        RefreshToken refreshToken = new RefreshToken();
        refreshToken.setId(UUID.randomUUID());
        refreshToken.setUserId(user.getId());
        refreshToken.setTokenHash(TokenHasher.sha256Hex(rawRefreshToken));
        refreshToken.setExpiresAt(Instant.now().plus(jwtProperties.refreshTokenTtl()));
        refreshTokenRepository.save(refreshToken);

        return new TokenPairResponse(accessToken, rawRefreshToken, jwtProperties.accessTokenTtl().toSeconds());
    }

    private String generateRawRefreshToken() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

}
