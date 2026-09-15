package com.example.easygymbackend.workout;

import com.example.easygymbackend.workout.dto.AddExerciseRequest;
import com.example.easygymbackend.workout.dto.AddSetRequest;
import com.example.easygymbackend.workout.dto.CreateExerciseRequest;
import com.example.easygymbackend.workout.dto.StartWorkoutRequest;
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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Etap 6 -- pierwsze realne wpięcie pakietu metrics (etap 3) w dane z bazy.
 * Sprawdza nie tylko "endpoint zwraca 200", ale że heaviestSet/PR faktycznie
 * poprawnie wykluczają rozgrzewkę/assisted na prawdziwych danych, nie tylko
 * na syntetycznych rekordach z metrics/*Test.java.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ExerciseProgressTest {

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
        jdbcTemplate.update("DELETE FROM users WHERE login IN ('progress-user-a', 'progress-user-b')");

        seedUser("progress-user-a");
        seedUser("progress-user-b");
        userAToken = login("progress-user-a");
        userBToken = login("progress-user-b");
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

    private UUID startWorkout(String token) throws Exception {
        String response = mockMvc.perform(post("/api/workouts")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new StartWorkoutRequest(UUID.randomUUID(), null, "trening", false))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(response).get("id").asString());
    }

    private UUID addGlobalExerciseToWorkout(String token, UUID workoutId) throws Exception {
        String response = mockMvc.perform(post("/api/workouts/" + workoutId + "/exercises")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(
                                new AddExerciseRequest(UUID.randomUUID(), GLOBAL_EXERCISE_ID, 1, null))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(response).get("id").asString());
    }

    private void addSet(String token, UUID workoutExerciseId, int setIndex, BigDecimal weightKg, int reps,
                         boolean warmup, boolean assisted) throws Exception {
        var request = new AddSetRequest(
                UUID.randomUUID(), setIndex, weightKg, reps, null, warmup, false, assisted, Instant.now());
        mockMvc.perform(post("/api/workout-exercises/" + workoutExerciseId + "/sets")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated());
    }

    private JsonNode getProgress(String token, UUID exerciseId) throws Exception {
        String response = mockMvc.perform(get("/api/exercises/" + exerciseId + "/progress")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response);
    }

    @Test
    void jedenPunktNaSesjeZNajciezszaSeriaWykluczajacRozgrzewkeIAssisted() throws Exception {
        UUID workoutId = startWorkout(userAToken);
        UUID workoutExerciseId = addGlobalExerciseToWorkout(userAToken, workoutId);

        addSet(userAToken, workoutExerciseId, 1, new BigDecimal("40.00"), 10, true, false);   // rozgrzewka
        addSet(userAToken, workoutExerciseId, 2, new BigDecimal("150.00"), 3, false, true);    // ciezsza, ale assisted
        addSet(userAToken, workoutExerciseId, 3, new BigDecimal("100.00"), 5, false, false);   // to ma wygrac

        JsonNode progress = getProgress(userAToken, GLOBAL_EXERCISE_ID);
        JsonNode points = progress.get("points");

        assertThat(points).hasSize(1);
        JsonNode point = points.get(0);
        assertThat(point.get("weightKg").asDouble()).isEqualTo(100.0);
        assertThat(point.get("reps").asInt()).isEqualTo(5);
        assertThat(point.get("workoutId").asString()).isEqualTo(workoutId.toString());
        // e1RM Epleya (domyslna formula): 100 * (1 + 5/30) = 116.67
        assertThat(point.get("e1rm").asDouble()).isEqualTo(116.67);
    }

    @Test
    void sesjaZSamymiRozgrzewkowymiSeriamiPomijanaWWykresie() throws Exception {
        UUID workoutId = startWorkout(userAToken);
        UUID workoutExerciseId = addGlobalExerciseToWorkout(userAToken, workoutId);
        addSet(userAToken, workoutExerciseId, 1, new BigDecimal("40.00"), 10, true, false);

        JsonNode progress = getProgress(userAToken, GLOBAL_EXERCISE_ID);

        assertThat(progress.get("points")).isEmpty();
    }

    @Test
    void wielePunktowWPoprawnejKolejnosciChronologicznej() throws Exception {
        UUID workout1 = startWorkout(userAToken);
        UUID we1 = addGlobalExerciseToWorkout(userAToken, workout1);
        addSet(userAToken, we1, 1, new BigDecimal("90.00"), 5, false, false);

        UUID workout2 = startWorkout(userAToken);
        UUID we2 = addGlobalExerciseToWorkout(userAToken, workout2);
        addSet(userAToken, we2, 1, new BigDecimal("95.00"), 5, false, false);

        JsonNode points = getProgress(userAToken, GLOBAL_EXERCISE_ID).get("points");

        assertThat(points).hasSize(2);
        assertThat(points.get(0).get("weightKg").asDouble()).isEqualTo(90.0);
        assertThat(points.get(1).get("weightKg").asDouble()).isEqualTo(95.0);
    }

    @Test
    void prMaxWeightOdpowiadaNajciezszejSeriiZCalejHistorii() throws Exception {
        UUID workout1 = startWorkout(userAToken);
        UUID we1 = addGlobalExerciseToWorkout(userAToken, workout1);
        addSet(userAToken, we1, 1, new BigDecimal("90.00"), 5, false, false);

        UUID workout2 = startWorkout(userAToken);
        UUID we2 = addGlobalExerciseToWorkout(userAToken, workout2);
        addSet(userAToken, we2, 1, new BigDecimal("110.00"), 3, false, false);

        JsonNode pr = getProgress(userAToken, GLOBAL_EXERCISE_ID).get("personalRecords");

        assertThat(pr.get("maxWeight").get("value").asDouble()).isEqualTo(110.0);
    }

    @Test
    void formulaBrzyckiegoDajeInnyE1rmNizEpley() throws Exception {
        UUID workoutId = startWorkout(userAToken);
        UUID workoutExerciseId = addGlobalExerciseToWorkout(userAToken, workoutId);
        // reps=5: Epley 100*(1+5/30)=116.67, Brzycki 100*36/(37-5)=112.50 -- realnie rozne.
        // (przy reps=10 obie formuly wychodza identycznie 133.33 -- zbieg okolicznosci, zla proba na test)
        addSet(userAToken, workoutExerciseId, 1, new BigDecimal("100.00"), 5, false, false);

        String response = mockMvc.perform(get("/api/exercises/" + GLOBAL_EXERCISE_ID + "/progress")
                        .param("formula", "BRZYCKI")
                        .header("Authorization", "Bearer " + userAToken))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode brzycki = objectMapper.readTree(response);

        double brzyckiE1rm = brzycki.get("points").get(0).get("e1rm").asDouble();
        JsonNode epley = getProgress(userAToken, GLOBAL_EXERCISE_ID);
        double epleyE1rm = epley.get("points").get(0).get("e1rm").asDouble();

        assertThat(brzyckiE1rm).isEqualTo(112.5);
        assertThat(epleyE1rm).isEqualTo(116.67);
    }

    @Test
    void uzytkownikBNieWidziDanychUzytkownikaADlaTegoSamegoGlobalnegoCwiczenia() throws Exception {
        UUID workoutId = startWorkout(userAToken);
        UUID workoutExerciseId = addGlobalExerciseToWorkout(userAToken, workoutId);
        addSet(userAToken, workoutExerciseId, 1, new BigDecimal("100.00"), 5, false, false);

        JsonNode progressForB = getProgress(userBToken, GLOBAL_EXERCISE_ID);

        assertThat(progressForB.get("points")).isEmpty();
        assertThat(progressForB.get("personalRecords").get("maxWeight").isNull()).isTrue();
    }

    @Test
    void wlasneCwiczenieUzytkownikaBNiewidoczneDlaUzytkownikaA() throws Exception {
        String customExerciseResponse = mockMvc.perform(post("/api/exercises")
                        .header("Authorization", "Bearer " + userBToken)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(
                                new CreateExerciseRequest(UUID.randomUUID(), "Cwiczenie B", "nogi", Equipment.MACHINE))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID exerciseBId = UUID.fromString(objectMapper.readTree(customExerciseResponse).get("id").asString());

        mockMvc.perform(get("/api/exercises/" + exerciseBId + "/progress")
                        .header("Authorization", "Bearer " + userAToken))
                .andExpect(status().isNotFound());
    }

}
