package com.example.easygymbackend.auth;

import com.example.easygymbackend.auth.dto.LoginRequest;
import com.example.easygymbackend.auth.dto.RefreshRequest;
import com.example.easygymbackend.auth.dto.TokenPairResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.ObjectMapper;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Testy pipeline'u JWT end-to-end -- nie tylko "endpoint zwraca 200", ale że
 * rotacja refresh tokenu faktycznie unieważnia stary token (replay protection)
 * i że chroniony endpoint bez ważnego tokenu jest odrzucany.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class AuthControllerTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    private static final String RAW_PASSWORD = "correct-horse-battery-staple";
    private static final UUID USER_ID = UUID.randomUUID();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    void seedUser() {
        jdbcTemplate.update("DELETE FROM refresh_tokens");
        jdbcTemplate.update("DELETE FROM users WHERE login = 'testuser'");
        jdbcTemplate.update(
                "INSERT INTO users (id, login, password_hash) VALUES (?, 'testuser', ?)",
                USER_ID, passwordEncoder.encode(RAW_PASSWORD));
    }

    @Test
    void logujeZPoprawnymHaslemIZwracaParaTokenow() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new LoginRequest("testuser", RAW_PASSWORD))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.refreshToken").isNotEmpty())
                .andExpect(jsonPath("$.expiresInSeconds").value(900));
    }

    @Test
    void odrzucaLogowanieZeZlymHaslem() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new LoginRequest("testuser", "zle-haslo"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void odrzucaLogowanieNieistniejacegoUzytkownika() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new LoginRequest("nikt-taki", RAW_PASSWORD))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void chronionyEndpointWymagaTokenu() throws Exception {
        mockMvc.perform(get("/api/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void chronionyEndpointDzialaZWaznymTokenem() throws Exception {
        TokenPairResponse tokens = login();

        mockMvc.perform(get("/api/me")
                        .header("Authorization", "Bearer " + tokens.accessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.login").value("testuser"))
                .andExpect(jsonPath("$.userId").value(USER_ID.toString()));
    }

    @Test
    void odrzucaNieprawidlowyTokenNaChronionymEndponcie() throws Exception {
        mockMvc.perform(get("/api/me")
                        .header("Authorization", "Bearer to-nie-jest-jwt"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void refreshRotujeTokenINiePozwalaGoUzycPonownie() throws Exception {
        TokenPairResponse firstTokens = login();

        String refreshBody = objectMapper.writeValueAsString(new RefreshRequest(firstTokens.refreshToken()));

        String response = mockMvc.perform(post("/api/auth/refresh")
                        .contentType("application/json")
                        .content(refreshBody))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        TokenPairResponse secondTokens = objectMapper.readValue(response, TokenPairResponse.class);
        assertThat(secondTokens.refreshToken()).isNotEqualTo(firstTokens.refreshToken());

        // Powtórne użycie STAREGO refresh tokenu -- musi zostać odrzucone (rotacja + wykrycie replay).
        mockMvc.perform(post("/api/auth/refresh")
                        .contentType("application/json")
                        .content(refreshBody))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void logoutUniewazniaRefreshToken() throws Exception {
        TokenPairResponse tokens = login();
        String refreshBody = objectMapper.writeValueAsString(new RefreshRequest(tokens.refreshToken()));

        mockMvc.perform(post("/api/auth/logout")
                        .contentType("application/json")
                        .content(refreshBody))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/auth/refresh")
                        .contentType("application/json")
                        .content(refreshBody))
                .andExpect(status().isUnauthorized());
    }

    private TokenPairResponse login() throws Exception {
        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new LoginRequest("testuser", RAW_PASSWORD))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        return objectMapper.readValue(response, TokenPairResponse.class);
    }

}
