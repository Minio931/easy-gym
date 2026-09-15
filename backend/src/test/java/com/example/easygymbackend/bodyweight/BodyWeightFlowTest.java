package com.example.easygymbackend.bodyweight;

import com.example.easygymbackend.bodyweight.dto.CreateBodyWeightRequest;
import com.example.easygymbackend.bodyweight.dto.UpdateBodyWeightRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Etap 7 -- wpis wagi ciała, "jeden na dzień" (409 na duplikat), średnie tygodniowe, izolacja. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class BodyWeightFlowTest {

    private static final String PASSWORD = "correct-horse-battery-staple";

    @Container
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private ObjectMapper objectMapper;

    private String userAToken;
    private String userBToken;

    @BeforeEach
    void seedUsersAndLogIn() throws Exception {
        jdbcTemplate.update("DELETE FROM body_weights");
        jdbcTemplate.update("DELETE FROM refresh_tokens");
        jdbcTemplate.update("DELETE FROM users WHERE login IN ('bw-user-a', 'bw-user-b')");

        seedUser("bw-user-a");
        seedUser("bw-user-b");
        userAToken = login("bw-user-a");
        userBToken = login("bw-user-b");
    }

    private void seedUser(String login) {
        jdbcTemplate.update(
                "INSERT INTO users (id, login, password_hash) VALUES (?, ?, ?)",
                UUID.randomUUID(), login, passwordEncoder.encode(PASSWORD));
    }

    private String login(String login) throws Exception {
        String response = mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("{\"login\":\"" + login + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response).get("accessToken").asString();
    }

    private UUID create(String token, LocalDate date, String weight) throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(post("/api/body-weights")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(
                                new CreateBodyWeightRequest(id, date, new BigDecimal(weight), null))))
                .andExpect(status().isCreated());
        return id;
    }

    private JsonNode getProgress(String token) throws Exception {
        String response = mockMvc.perform(get("/api/body-weights").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response);
    }

    @Test
    void tworzyWpisIPojawiaSieWProgresie() throws Exception {
        create(userAToken, LocalDate.of(2026, 6, 8), "82.50");

        JsonNode progress = getProgress(userAToken);

        assertThat(progress.get("entries")).hasSize(1);
        assertThat(progress.get("entries").get(0).get("weightKg").asDouble()).isEqualTo(82.5);
    }

    @Test
    void drugiWpisTegoSamegoDniaOdrzuconyJako409() throws Exception {
        create(userAToken, LocalDate.of(2026, 6, 8), "82.50");

        mockMvc.perform(post("/api/body-weights")
                        .header("Authorization", "Bearer " + userAToken)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new CreateBodyWeightRequest(
                                UUID.randomUUID(), LocalDate.of(2026, 6, 8), new BigDecimal("83.00"), null))))
                .andExpect(status().isConflict());
    }

    @Test
    void edycjaIstniejacegoWpisuPrzezPatch() throws Exception {
        UUID id = create(userAToken, LocalDate.of(2026, 6, 8), "82.50");

        mockMvc.perform(patch("/api/body-weights/" + id)
                        .header("Authorization", "Bearer " + userAToken)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new UpdateBodyWeightRequest(new BigDecimal("81.90"), "korekta"))))
                .andExpect(status().isOk());

        JsonNode entry = getProgress(userAToken).get("entries").get(0);
        assertThat(entry.get("weightKg").asDouble()).isEqualTo(81.9);
        assertThat(entry.get("note").asString()).isEqualTo("korekta");
    }

    @Test
    void usunietyWpisZnikaZProgresu() throws Exception {
        UUID id = create(userAToken, LocalDate.of(2026, 6, 8), "82.50");

        mockMvc.perform(delete("/api/body-weights/" + id).header("Authorization", "Bearer " + userAToken))
                .andExpect(status().isNoContent());

        assertThat(getProgress(userAToken).get("entries")).isEmpty();
    }

    @Test
    void sredniaTygodniowaINiepelnyTydzien() throws Exception {
        // Poniedzialek-sroda tego samego tygodnia ISO -- 3 pomiary, tydzien pelny.
        create(userAToken, LocalDate.of(2026, 6, 8), "80.00");
        create(userAToken, LocalDate.of(2026, 6, 9), "81.00");
        create(userAToken, LocalDate.of(2026, 6, 10), "82.00");

        JsonNode weeks = getProgress(userAToken).get("weeklyAverages");

        assertThat(weeks).hasSize(1);
        assertThat(weeks.get(0).get("measurementCount").asInt()).isEqualTo(3);
        assertThat(weeks.get(0).get("averageKg").asDouble()).isEqualTo(81.0);
        assertThat(weeks.get(0).get("incomplete").asBoolean()).isFalse();
    }

    @Test
    void tydzienZJednymPomiaremNiepelny() throws Exception {
        create(userAToken, LocalDate.of(2026, 6, 8), "80.00");

        JsonNode weeks = getProgress(userAToken).get("weeklyAverages");

        assertThat(weeks.get(0).get("incomplete").asBoolean()).isTrue();
    }

    @Test
    void odrzucaWagePozaZakresem() throws Exception {
        mockMvc.perform(post("/api/body-weights")
                        .header("Authorization", "Bearer " + userAToken)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new CreateBodyWeightRequest(
                                UUID.randomUUID(), LocalDate.of(2026, 6, 8), new BigDecimal("450.00"), null))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void uzytkownikBNieWidziWpisowUzytkownikaA() throws Exception {
        create(userAToken, LocalDate.of(2026, 6, 8), "82.50");

        assertThat(getProgress(userBToken).get("entries")).isEmpty();
    }

    @Test
    void uzytkownikBNieMozeEdytowacAniUsunacWpisuUzytkownikaA() throws Exception {
        UUID id = create(userAToken, LocalDate.of(2026, 6, 8), "82.50");

        mockMvc.perform(patch("/api/body-weights/" + id)
                        .header("Authorization", "Bearer " + userBToken)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new UpdateBodyWeightRequest(new BigDecimal("50.00"), null))))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete("/api/body-weights/" + id).header("Authorization", "Bearer " + userBToken))
                .andExpect(status().isNotFound());
    }

}
