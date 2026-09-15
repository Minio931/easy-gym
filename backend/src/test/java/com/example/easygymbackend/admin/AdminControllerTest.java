package com.example.easygymbackend.admin;

import com.example.easygymbackend.admin.dto.CreateUserRequest;
import com.example.easygymbackend.auth.dto.LoginRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.ObjectMapper;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;

/**
 * Zastąpiło pierwotny pomysł "generuj hash lokalnie, wklej do migracji" --
 * konta zakładane przez POST /api/admin/users chroniony osobnym sekretem
 * (nie JWT, bo w momencie zakładania pierwszego konta nikt nie ma jeszcze
 * jak się zalogować). Test potwierdza też, że konto założone tą drogą
 * faktycznie działa w normalnym /api/auth/login -- nie tylko że insert
 * do bazy się udał.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class AdminControllerTest {

    private static final String TEST_SECRET = "test-bootstrap-secret";

    @Container
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void adminSecret(DynamicPropertyRegistry registry) {
        registry.add("app.admin.bootstrap-secret", () -> TEST_SECRET);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    void cleanUsers() {
        jdbcTemplate.update("DELETE FROM refresh_tokens");
        jdbcTemplate.update("DELETE FROM users WHERE login IN ('Minio', 'Wojtur')");
    }

    @Test
    void tworzyKontoZPoprawnymSekretem() throws Exception {
        mockMvc.perform(post("/api/admin/users")
                        .header("X-Bootstrap-Secret", TEST_SECRET)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new CreateUserRequest("Minio", "haslo-minio-123"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.login").value("Minio"))
                .andExpect(jsonPath("$.id").isNotEmpty())
                // Regresja: @CreationTimestamp liczy się dopiero przy flushu, save() bez
                // saveAndFlush zwracał tu createdAt=null mimo poprawnej wartości w bazie.
                .andExpect(jsonPath("$.createdAt").isNotEmpty());
    }

    @Test
    void kontoZalozonePrzezEndpointDzialaWLogowaniu() throws Exception {
        mockMvc.perform(post("/api/admin/users")
                        .header("X-Bootstrap-Secret", TEST_SECRET)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new CreateUserRequest("Wojtur", "haslo-wojtur-123"))))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new LoginRequest("Wojtur", "haslo-wojtur-123"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty());
    }

    @Test
    void odrzucaZlySekret() throws Exception {
        mockMvc.perform(post("/api/admin/users")
                        .header("X-Bootstrap-Secret", "zly-sekret")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new CreateUserRequest("Minio", "haslo-minio-123"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void odrzucaBrakSekretu() throws Exception {
        mockMvc.perform(post("/api/admin/users")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new CreateUserRequest("Minio", "haslo-minio-123"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void odrzucaDuplikatLoginu() throws Exception {
        mockMvc.perform(post("/api/admin/users")
                        .header("X-Bootstrap-Secret", TEST_SECRET)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new CreateUserRequest("Minio", "haslo-minio-123"))))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/admin/users")
                        .header("X-Bootstrap-Secret", TEST_SECRET)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new CreateUserRequest("Minio", "inne-haslo-456"))))
                .andExpect(status().isConflict());
    }

    @Test
    void odrzucaZaKrotkieHaslo() throws Exception {
        mockMvc.perform(post("/api/admin/users")
                        .header("X-Bootstrap-Secret", TEST_SECRET)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new CreateUserRequest("Minio", "krotkie"))))
                .andExpect(status().isBadRequest());
    }

}
