package com.example.easygymbackend.support;

import com.example.easygymbackend.auth.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;

import java.util.UUID;

/**
 * Baza dla testów API domenowego. Kontener Postgresa jest JEDEN na całą
 * maszynę wirtualną testów (wzorzec singleton container), a nie jeden na
 * klasę -- inaczej każda klasa dokładałaby ~20 s startu, a testów izolacji
 * user A / user B jest z założenia dużo (wymóg z CLAUDE.md).
 *
 * Każdy test dostaje dwóch świeżych userów: `userA` i `userB`. `userB` jest
 * po to, żeby sprawdzać, że NIE widzi danych `userA` -- to jest obowiązkowy
 * element testu każdego endpointu per-user.
 */
@SpringBootTest
@AutoConfigureMockMvc
public abstract class ApiIntegrationTest {

    protected static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    static {
        POSTGRES.start();
    }

    @DynamicPropertySource
    static void datasourceProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected JdbcTemplate jdbcTemplate;

    @Autowired
    protected ObjectMapper objectMapper;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    protected TestUser userA;
    protected TestUser userB;

    @BeforeEach
    void prepareUsers() {
        // Kasowanie użytkownika kaskaduje na wszystkie jego dane (FK ON DELETE
        // CASCADE), więc jeden DELETE czyści stan po poprzednim teście.
        jdbcTemplate.update("DELETE FROM users WHERE login LIKE 'it-%'");
        userA = createUser("it-a-" + UUID.randomUUID());
        userB = createUser("it-b-" + UUID.randomUUID());
    }

    protected TestUser createUser(String login) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO users (id, login, password_hash) VALUES (?, ?, ?)",
                id, login, passwordEncoder.encode("haslo-testowe-123"));
        return new TestUser(id, login, jwtService.generateAccessToken(id, login));
    }

    protected MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder builder, TestUser user) {
        return builder.header("Authorization", "Bearer " + user.token());
    }

    protected MockHttpServletRequestBuilder asJson(MockHttpServletRequestBuilder builder, TestUser user, Object body) {
        return as(builder, user)
                .contentType("application/json")
                .content(objectMapper.writeValueAsString(body));
    }

    protected record TestUser(UUID id, String login, String token) {
    }

}
