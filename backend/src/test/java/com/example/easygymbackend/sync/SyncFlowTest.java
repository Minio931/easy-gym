package com.example.easygymbackend.sync;

import com.example.easygymbackend.sync.dto.SetSyncRecord;
import com.example.easygymbackend.sync.dto.SyncBatch;
import com.example.easygymbackend.sync.dto.SyncPushRequest;
import com.example.easygymbackend.sync.dto.WorkoutExerciseSyncRecord;
import com.example.easygymbackend.sync.dto.WorkoutSyncRecord;
import com.example.easygymbackend.workout.Equipment;
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
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Endpoint sync (etap 5) -- batch upsert z LWW po updated_at, tombstone'y,
 * i decyzja o odrzucaniu CAŁEGO batcha (400) przy konflikcie własności
 * (patrz SyncService). Atomowość sprawdzona nie tylko przez kod odpowiedzi,
 * ale przez bezpośrednie zapytanie do bazy że nic się nie zapisało.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class SyncFlowTest {

    private static final UUID GLOBAL_EXERCISE_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
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
        jdbcTemplate.update("DELETE FROM sets");
        jdbcTemplate.update("DELETE FROM workout_exercises");
        jdbcTemplate.update("DELETE FROM workouts");
        jdbcTemplate.update("DELETE FROM exercises WHERE user_id IS NOT NULL");
        jdbcTemplate.update("DELETE FROM refresh_tokens");
        jdbcTemplate.update("DELETE FROM users WHERE login IN ('sync-user-a', 'sync-user-b')");

        seedUser("sync-user-a");
        seedUser("sync-user-b");
        userAToken = login("sync-user-a");
        userBToken = login("sync-user-b");
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

    private JsonNode push(String token, SyncPushRequest request) throws Exception {
        String response = mockMvc.perform(post("/api/sync")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response);
    }

    @Test
    void offlineUtworzonaSesjaSynchronizujeSieJednymBatchem() throws Exception {
        UUID workoutId = UUID.randomUUID();
        UUID workoutExerciseId = UUID.randomUUID();
        UUID setId = UUID.randomUUID();
        Instant now = Instant.now();

        var request = new SyncPushRequest(null, new SyncBatch(
                List.of(),
                List.of(new WorkoutSyncRecord(workoutId, now, null, null, "trening offline", false, now, null)),
                List.of(new WorkoutExerciseSyncRecord(workoutExerciseId, workoutId, GLOBAL_EXERCISE_ID, 1, null, now, null)),
                List.of(new SetSyncRecord(setId, workoutExerciseId, 1, new BigDecimal("100.00"), 5, null,
                        false, false, false, now, now, null)),
                List.of()
        ));

        JsonNode response = push(userAToken, request);

        assertThat(response.get("changes").get("workouts")).anyMatch(n -> n.get("id").asString().equals(workoutId.toString()));
        assertThat(response.get("changes").get("workoutExercises"))
                .anyMatch(n -> n.get("id").asString().equals(workoutExerciseId.toString()));
        assertThat(response.get("changes").get("sets")).anyMatch(n -> n.get("id").asString().equals(setId.toString()));
    }

    @Test
    void starszaAktualizacjaJestIgnorowanaLww() throws Exception {
        UUID workoutId = UUID.randomUUID();
        Instant older = Instant.now().minus(1, ChronoUnit.HOURS);
        Instant newer = Instant.now();

        push(userAToken, singleWorkoutPush(workoutId, "nowsza notatka", newer));
        push(userAToken, singleWorkoutPush(workoutId, "starsza notatka -- powinna zostac zignorowana", older));

        JsonNode pulled = pullAll(userAToken);
        String notes = findWorkout(pulled, workoutId).get("notes").asString();

        assertThat(notes).isEqualTo("nowsza notatka");
    }

    @Test
    void nowszaAktualizacjaNadpisujeStara() throws Exception {
        UUID workoutId = UUID.randomUUID();
        Instant first = Instant.now().minus(1, ChronoUnit.HOURS);
        Instant later = Instant.now();

        push(userAToken, singleWorkoutPush(workoutId, "pierwsza", first));
        push(userAToken, singleWorkoutPush(workoutId, "zaktualizowana", later));

        JsonNode pulled = pullAll(userAToken);
        assertThat(findWorkout(pulled, workoutId).get("notes").asString()).isEqualTo("zaktualizowana");
    }

    @Test
    void tombstoneUsunieciaSynchronizujeSieZDeletedAt() throws Exception {
        UUID workoutId = UUID.randomUUID();
        Instant created = Instant.now().minus(1, ChronoUnit.HOURS);
        Instant deletedAt = Instant.now();

        push(userAToken, singleWorkoutPush(workoutId, "do skasowania", created));

        var deleteRequest = new SyncPushRequest(null, new SyncBatch(
                List.of(), List.of(new WorkoutSyncRecord(workoutId, created, null, null, "do skasowania", false, deletedAt, deletedAt)),
                List.of(), List.of(), List.of()
        ));
        push(userAToken, deleteRequest);

        JsonNode pulled = pullAll(userAToken);
        JsonNode workout = findWorkout(pulled, workoutId);
        assertThat(workout.get("deletedAt").isNull()).isFalse();
    }

    @Test
    void sinceZwracaTylkoZmianyPoKursorze() throws Exception {
        UUID oldWorkoutId = UUID.randomUUID();
        Instant cursor = Instant.now().minus(1, ChronoUnit.HOURS);
        push(userAToken, singleWorkoutPush(oldWorkoutId, "stary, przed kursorem", cursor));

        UUID newWorkoutId = UUID.randomUUID();
        Instant afterCursor = Instant.now();
        push(userAToken, singleWorkoutPush(newWorkoutId, "nowy, po kursorze", afterCursor));

        String response = mockMvc.perform(get("/api/sync")
                        .header("Authorization", "Bearer " + userAToken)
                        .param("since", cursor.toString()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode pulled = objectMapper.readTree(response);

        assertThat(pulled.get("changes").get("workouts"))
                .noneMatch(n -> n.get("id").asString().equals(oldWorkoutId.toString()))
                .anyMatch(n -> n.get("id").asString().equals(newWorkoutId.toString()));
    }

    @Test
    void konfliktWlasnosciOdrzucaCalyBatchIchNicSieNieZapisuje() throws Exception {
        UUID userAWorkoutId = UUID.randomUUID();
        push(userAToken, singleWorkoutPush(userAWorkoutId, "trening usera A", Instant.now()));

        UUID userBOwnValidWorkoutId = UUID.randomUUID();
        UUID conflictingWorkoutExerciseId = UUID.randomUUID();
        Instant now = Instant.now();

        // Batch usera B: jeden poprawny nowy trening + jeden workout_exercise
        // wskazujący na trening usera A -- caly batch musi paść.
        var request = new SyncPushRequest(null, new SyncBatch(
                List.of(),
                List.of(new WorkoutSyncRecord(userBOwnValidWorkoutId, now, null, null, "powinno zniknac", false, now, null)),
                List.of(new WorkoutExerciseSyncRecord(
                        conflictingWorkoutExerciseId, userAWorkoutId, GLOBAL_EXERCISE_ID, 1, null, now, null)),
                List.of(), List.of()
        ));

        mockMvc.perform(post("/api/sync")
                        .header("Authorization", "Bearer " + userBToken)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());

        Integer count = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM workouts WHERE id = ?", Integer.class, userBOwnValidWorkoutId);
        assertThat(count).isZero();
    }

    @Test
    void zmianyZDrugiegoUrzadzeniaTegoSamegoUzytkownikaWracajaWKolejnymPushu() throws Exception {
        UUID device1WorkoutId = UUID.randomUUID();
        push(userAToken, singleWorkoutPush(device1WorkoutId, "z urzadzenia 1", Instant.now()));

        UUID device2WorkoutId = UUID.randomUUID();
        JsonNode device2Response = push(userAToken, singleWorkoutPush(device2WorkoutId, "z urzadzenia 2", Instant.now()));

        assertThat(device2Response.get("changes").get("workouts"))
                .anyMatch(n -> n.get("id").asString().equals(device1WorkoutId.toString()))
                .anyMatch(n -> n.get("id").asString().equals(device2WorkoutId.toString()));
    }

    private SyncPushRequest singleWorkoutPush(UUID workoutId, String notes, Instant updatedAt) {
        return new SyncPushRequest(null, new SyncBatch(
                List.of(),
                List.of(new WorkoutSyncRecord(workoutId, updatedAt, null, null, notes, false, updatedAt, null)),
                List.of(),
                List.of(),
                List.of()
        ));
    }

    private JsonNode pullAll(String token) throws Exception {
        String response = mockMvc.perform(get("/api/sync").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response);
    }

    private JsonNode findWorkout(JsonNode pulled, UUID workoutId) {
        for (JsonNode node : pulled.get("changes").get("workouts")) {
            if (node.get("id").asString().equals(workoutId.toString())) {
                return node;
            }
        }
        throw new AssertionError("Workout " + workoutId + " not found in pulled changes");
    }

}
