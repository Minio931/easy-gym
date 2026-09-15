package com.example.easygymbackend.workout;

import com.example.easygymbackend.workout.dto.AddExerciseRequest;
import com.example.easygymbackend.workout.dto.AddSetRequest;
import com.example.easygymbackend.workout.dto.CreateExerciseRequest;
import com.example.easygymbackend.workout.dto.StartWorkoutRequest;
import com.example.easygymbackend.workout.dto.UpdateSetRequest;
import com.example.easygymbackend.workout.dto.UpdateWorkoutRequest;
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
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Egzekwuje decyzję 2 z CLAUDE.md: każdy endpoint per-user musi mieć test
 * "user A nie widzi/nie modyfikuje danych usera B". Izolacja tutaj jest
 * tranzytywna (set -> workout_exercise -> workout -> user_id), więc testy
 * pokrywają każdy szczebel tego łańcucha osobno, nie tylko najgłębszy.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class WorkoutFlowTest {

    // 'Wyciskanie sztangi na ławce płaskiej' -- globalne ćwiczenie z seeda V4, id stałe.
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
        jdbcTemplate.update("DELETE FROM users WHERE login IN ('flow-user-a', 'flow-user-b')");

        seedUser("flow-user-a");
        seedUser("flow-user-b");
        userAToken = login("flow-user-a");
        userBToken = login("flow-user-b");
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
                        .content(objectMapper.writeValueAsString(new StartWorkoutRequest(null, "trening", false))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(response).get("id").asString());
    }

    private UUID addGlobalExerciseToWorkout(String token, UUID workoutId) throws Exception {
        String response = mockMvc.perform(post("/api/workouts/" + workoutId + "/exercises")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(
                                new AddExerciseRequest(GLOBAL_EXERCISE_ID, 1, null))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(response).get("id").asString());
    }

    private UUID addSet(String token, UUID workoutExerciseId, BigDecimal weightKg, int reps) throws Exception {
        var request = new AddSetRequest(1, weightKg, reps, null, false, false, false, Instant.now());
        String response = mockMvc.perform(post("/api/workout-exercises/" + workoutExerciseId + "/sets")
                        .header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(response).get("id").asString());
    }

    @Test
    void wlasnyCwiczenieWidoczneTylkoDlaWlasciciela() throws Exception {
        mockMvc.perform(post("/api/exercises")
                        .header("Authorization", "Bearer " + userAToken)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(
                                new CreateExerciseRequest("Mój wyciskacz", "klatka piersiowa", Equipment.OTHER))))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/exercises").header("Authorization", "Bearer " + userAToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.name == 'Mój wyciskacz')]").isNotEmpty());

        mockMvc.perform(get("/api/exercises").header("Authorization", "Bearer " + userBToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.name == 'Mój wyciskacz')]").isEmpty());
    }

    @Test
    void globalneCwiczenieWidoczneDlaObuUzytkownikow() throws Exception {
        mockMvc.perform(get("/api/exercises?search=Wyciskanie sztangi")
                        .header("Authorization", "Bearer " + userAToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == '" + GLOBAL_EXERCISE_ID + "')]").isNotEmpty());

        mockMvc.perform(get("/api/exercises?search=Wyciskanie sztangi")
                        .header("Authorization", "Bearer " + userBToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == '" + GLOBAL_EXERCISE_ID + "')]").isNotEmpty());
    }

    @Test
    void pelnyPrzeplywTreninguOdStartuDoZakonczenia() throws Exception {
        UUID workoutId = startWorkout(userAToken);
        UUID workoutExerciseId = addGlobalExerciseToWorkout(userAToken, workoutId);
        addSet(userAToken, workoutExerciseId, new BigDecimal("100.00"), 5);

        mockMvc.perform(patch("/api/workouts/" + workoutId)
                        .header("Authorization", "Bearer " + userAToken)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(
                                new UpdateWorkoutRequest(Instant.now(), null, null))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.endedAt").isNotEmpty());

        mockMvc.perform(get("/api/workouts/" + workoutId).header("Authorization", "Bearer " + userAToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.exercises[0].exerciseId").value(GLOBAL_EXERCISE_ID.toString()))
                .andExpect(jsonPath("$.exercises[0].sets[0].weightKg").value(100.0))
                .andExpect(jsonPath("$.exercises[0].sets[0].reps").value(5));
    }

    @Test
    void uzytkownikBNieWidziTreninguUzytkownikaA() throws Exception {
        UUID workoutId = startWorkout(userAToken);

        mockMvc.perform(get("/api/workouts/" + workoutId).header("Authorization", "Bearer " + userBToken))
                .andExpect(status().isNotFound());

        mockMvc.perform(patch("/api/workouts/" + workoutId)
                        .header("Authorization", "Bearer " + userBToken)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new UpdateWorkoutRequest(Instant.now(), null, null))))
                .andExpect(status().isNotFound());
    }

    @Test
    void uzytkownikBNieMozeDodacCwiczeniaDoTreninguUzytkownikaA() throws Exception {
        UUID workoutId = startWorkout(userAToken);

        mockMvc.perform(post("/api/workouts/" + workoutId + "/exercises")
                        .header("Authorization", "Bearer " + userBToken)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new AddExerciseRequest(GLOBAL_EXERCISE_ID, 1, null))))
                .andExpect(status().isNotFound());
    }

    @Test
    void uzytkownikANieMozeUzycCwiczeniaWlasnegoUzytkownikaB() throws Exception {
        String customExerciseResponse = mockMvc.perform(post("/api/exercises")
                        .header("Authorization", "Bearer " + userBToken)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(
                                new CreateExerciseRequest("Cwiczenie B", "nogi", Equipment.MACHINE))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        UUID exerciseBId = UUID.fromString(objectMapper.readTree(customExerciseResponse).get("id").asString());

        UUID workoutId = startWorkout(userAToken);

        mockMvc.perform(post("/api/workouts/" + workoutId + "/exercises")
                        .header("Authorization", "Bearer " + userAToken)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(new AddExerciseRequest(exerciseBId, 1, null))))
                .andExpect(status().isNotFound());
    }

    @Test
    void uzytkownikBNieMozeDodacSeriiDoCwiczeniaUzytkownikaA() throws Exception {
        UUID workoutId = startWorkout(userAToken);
        UUID workoutExerciseId = addGlobalExerciseToWorkout(userAToken, workoutId);

        var request = new AddSetRequest(1, new BigDecimal("100.00"), 5, null, false, false, false, Instant.now());
        mockMvc.perform(post("/api/workout-exercises/" + workoutExerciseId + "/sets")
                        .header("Authorization", "Bearer " + userBToken)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isNotFound());
    }

    @Test
    void uzytkownikBNieMozeEdytowacAniUsunacSeriiUzytkownikaA() throws Exception {
        UUID workoutId = startWorkout(userAToken);
        UUID workoutExerciseId = addGlobalExerciseToWorkout(userAToken, workoutId);
        UUID setId = addSet(userAToken, workoutExerciseId, new BigDecimal("100.00"), 5);

        // Waga w dozwolonym zakresie (<=500) -- inaczej request odbija się o walidację
        // DTO (400) zanim w ogóle dotrze do sprawdzenia właściciela, i test niczego
        // by nie sprawdzał poza tym że walidacja działa.
        mockMvc.perform(patch("/api/sets/" + setId)
                        .header("Authorization", "Bearer " + userBToken)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(
                                new UpdateSetRequest(null, new BigDecimal("90.00"), null, null, null, null, null))))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete("/api/sets/" + setId).header("Authorization", "Bearer " + userBToken))
                .andExpect(status().isNotFound());
    }

    @Test
    void usunietaSeriaZnikaZOdpowiedziAleZostajeWBazieJakoSoftDelete() throws Exception {
        UUID workoutId = startWorkout(userAToken);
        UUID workoutExerciseId = addGlobalExerciseToWorkout(userAToken, workoutId);
        UUID setId = addSet(userAToken, workoutExerciseId, new BigDecimal("100.00"), 5);

        mockMvc.perform(delete("/api/sets/" + setId).header("Authorization", "Bearer " + userAToken))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/workouts/" + workoutId).header("Authorization", "Bearer " + userAToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.exercises[0].sets").isEmpty());

        Instant deletedAt = jdbcTemplate.queryForObject(
                "SELECT deleted_at FROM sets WHERE id = ?", Instant.class, setId);
        assertThat(deletedAt).isNotNull();
    }

    @Test
    void listaTreningowZwracaTylkoWlasneUzytkownika() throws Exception {
        startWorkout(userAToken);
        startWorkout(userBToken);

        mockMvc.perform(get("/api/workouts").header("Authorization", "Bearer " + userAToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void odrzucaSerieZCiezaremPozaZakresem() throws Exception {
        UUID workoutId = startWorkout(userAToken);
        UUID workoutExerciseId = addGlobalExerciseToWorkout(userAToken, workoutId);

        var tooHeavy = new AddSetRequest(1, new BigDecimal("600.00"), 5, null, false, false, false, Instant.now());
        mockMvc.perform(post("/api/workout-exercises/" + workoutExerciseId + "/sets")
                        .header("Authorization", "Bearer " + userAToken)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(tooHeavy)))
                .andExpect(status().isBadRequest());

        var zeroReps = new AddSetRequest(1, new BigDecimal("100.00"), 0, null, false, false, false, Instant.now());
        mockMvc.perform(post("/api/workout-exercises/" + workoutExerciseId + "/sets")
                        .header("Authorization", "Bearer " + userAToken)
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(zeroReps)))
                .andExpect(status().isBadRequest());
    }

}
