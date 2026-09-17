package com.example.easygymbackend.workout;

import com.example.easygymbackend.support.ApiIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class WorkoutApiTest extends ApiIntegrationTest {

    private static final UUID BENCH_PRESS = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID DEADLIFT = UUID.fromString("00000000-0000-0000-0000-000000000009");

    @Test
    void liczyObjetoscSesjiWykluczajacRozgrzewkeIAssistedTylkoZPrEligible() throws Exception {
        UUID workoutId = startWorkout(userA, "2026-09-01T16:00:00Z");
        UUID exerciseId = addExercise(userA, workoutId, BENCH_PRESS, 0);

        addSet(userA, workoutId, exerciseId, 0, "40.00", 10, true, false);
        addSet(userA, workoutId, exerciseId, 1, "100.00", 5, false, false);
        addSet(userA, workoutId, exerciseId, 2, "80.00", 8, false, true);

        mockMvc.perform(as(get("/api/workouts/" + workoutId), userA))
                .andExpect(status().isOk())
                // display: 100x5 + 80x8 (assisted wliczone, rozgrzewka nie)
                .andExpect(jsonPath("$.displayVolumeKg").value(1140.00))
                // prEligible: tylko 100x5 -- assisted wykluczone z PR
                .andExpect(jsonPath("$.prEligibleVolumeKg").value(500.00))
                .andExpect(jsonPath("$.workingSetCount").value(2))
                .andExpect(jsonPath("$.exercises[0].sets.length()").value(3))
                // e1RM Epleya dla 100 kg x 5: 100 * (1 + 5/30) = 116.67
                .andExpect(jsonPath("$.exercises[0].sets[1].e1rmKg").value(116.67));

        mockMvc.perform(as(get("/api/workouts/" + workoutId + "?formula=brzycki"), userA))
                .andExpect(status().isOk())
                // Brzycki: 100 * 36 / 32 = 112.50
                .andExpect(jsonPath("$.exercises[0].sets[1].e1rmKg").value(112.50));
    }

    @Test
    void wykrywaPobiciaRekordowWMomencieSesjiAResmisuNieLiczy() throws Exception {
        UUID first = startWorkout(userA, "2026-09-01T16:00:00Z");
        UUID firstExercise = addExercise(userA, first, BENCH_PRESS, 0);
        addSet(userA, first, firstExercise, 0, "100.00", 5, false, false);

        UUID second = startWorkout(userA, "2026-09-08T16:00:00Z");
        UUID secondExercise = addExercise(userA, second, BENCH_PRESS, 0);
        addSet(userA, second, secondExercise, 0, "105.00", 5, false, false);

        mockMvc.perform(as(get("/api/workouts/" + second), userA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.personalRecordsBrokenIn[?(@.category == 'WEIGHT')].value")
                        .value(org.hamcrest.Matchers.contains(105.00)));

        // Trzecia sesja z tym samym ciężarem: remis to NIE pobicie rekordu.
        UUID third = startWorkout(userA, "2026-09-15T16:00:00Z");
        UUID thirdExercise = addExercise(userA, third, BENCH_PRESS, 0);
        addSet(userA, third, thirdExercise, 0, "105.00", 5, false, false);

        mockMvc.perform(as(get("/api/workouts/" + third), userA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.personalRecordsBrokenIn[?(@.category == 'WEIGHT')]")
                        .value(org.hamcrest.Matchers.empty()));
    }

    @Test
    void historiaCwiczeniaZwracaSesjeChronologicznieIAktualneRekordy() throws Exception {
        UUID first = startWorkout(userA, "2026-09-01T16:00:00Z");
        addSet(userA, first, addExercise(userA, first, DEADLIFT, 0), 0, "140.00", 3, false, false);
        UUID second = startWorkout(userA, "2026-09-08T16:00:00Z");
        addSet(userA, second, addExercise(userA, second, DEADLIFT, 0), 0, "150.00", 3, false, false);

        mockMvc.perform(as(get("/api/exercises/" + DEADLIFT + "/history"), userA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sessions.length()").value(2))
                .andExpect(jsonPath("$.sessions[0].workoutId").value(first.toString()))
                .andExpect(jsonPath("$.sessions[1].heaviestSet.weightKg").value(150.00))
                .andExpect(jsonPath("$.personalRecords.maxWeight.value").value(150.00))
                .andExpect(jsonPath("$.personalRecords.byRepRange.TWO_TO_THREE.value").value(150.00));

        // userB ma tę samą globalną pozycję w katalogu, ale zero historii.
        mockMvc.perform(as(get("/api/exercises/" + DEADLIFT + "/history"), userB))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sessions.length()").value(0))
                .andExpect(jsonPath("$.personalRecords.maxWeight").doesNotExist());
    }

    @Test
    void konczyTreningIWyliczaCzasTrwania() throws Exception {
        UUID workoutId = startWorkout(userA, "2026-09-01T16:00:00Z");

        mockMvc.perform(as(get("/api/workouts/active"), userA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(workoutId.toString()));

        mockMvc.perform(asJson(put("/api/workouts/" + workoutId), userA, Map.of(
                        "startedAt", "2026-09-01T16:00:00Z",
                        "endedAt", "2026-09-01T17:30:00Z")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.durationSeconds").value(5400));

        mockMvc.perform(as(get("/api/workouts/active"), userA)).andExpect(status().isNoContent());
    }

    @Test
    void usuwaTreningMiekkoRazemZSeriami() throws Exception {
        UUID workoutId = startWorkout(userA, "2026-09-01T16:00:00Z");
        UUID exerciseId = addExercise(userA, workoutId, BENCH_PRESS, 0);
        addSet(userA, workoutId, exerciseId, 0, "100.00", 5, false, false);

        mockMvc.perform(as(delete("/api/workouts/" + workoutId), userA)).andExpect(status().isNoContent());

        Integer liveSets = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM sets WHERE workout_exercise_id = ? AND deleted_at IS NULL",
                Integer.class, exerciseId);
        assertThat(liveSets).isZero();
        mockMvc.perform(as(get("/api/workouts/" + workoutId), userA)).andExpect(status().isNotFound());
        mockMvc.perform(as(get("/api/workouts"), userA))
                .andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    void nieUjawniaAniNieModyfikujeTreninguInnegoUsera() throws Exception {
        UUID workoutId = startWorkout(userA, "2026-09-01T16:00:00Z");
        UUID exerciseId = addExercise(userA, workoutId, BENCH_PRESS, 0);
        addSet(userA, workoutId, exerciseId, 0, "100.00", 5, false, false);

        mockMvc.perform(as(get("/api/workouts/" + workoutId), userB)).andExpect(status().isNotFound());
        mockMvc.perform(as(delete("/api/workouts/" + workoutId), userB)).andExpect(status().isNotFound());
        mockMvc.perform(asJson(post("/api/workouts/" + workoutId + "/exercises"), userB, Map.of(
                        "exerciseId", BENCH_PRESS, "orderIndex", 1)))
                .andExpect(status().isNotFound());
        mockMvc.perform(asJson(put("/api/workouts/" + workoutId + "/exercises/" + exerciseId + "/sets/"
                        + UUID.randomUUID()), userB, setBody(0, "200.00", 1, false, false)))
                .andExpect(status().isNotFound());

        mockMvc.perform(as(get("/api/workouts"), userB))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0))
                .andExpect(jsonPath("$.total").value(0));

        // Dane userA nietknięte mimo prób userB.
        mockMvc.perform(as(get("/api/workouts/" + workoutId), userA))
                .andExpect(jsonPath("$.exercises[0].sets.length()").value(1));
    }

    @Test
    void odrzucaCwiczenieNalezaceDoInnegoKonta() throws Exception {
        UUID foreignExercise = UUID.randomUUID();
        mockMvc.perform(asJson(post("/api/exercises"), userB, Map.of(
                        "id", foreignExercise, "name", "Cudze", "muscleGroup", "barki", "equipment", "cable")))
                .andExpect(status().isCreated());

        UUID workoutId = startWorkout(userA, "2026-09-01T16:00:00Z");
        mockMvc.perform(asJson(post("/api/workouts/" + workoutId + "/exercises"), userA, Map.of(
                        "exerciseId", foreignExercise, "orderIndex", 0)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void odrzucaSerieSpozaZakresowZBazy() throws Exception {
        UUID workoutId = startWorkout(userA, "2026-09-01T16:00:00Z");
        UUID exerciseId = addExercise(userA, workoutId, BENCH_PRESS, 0);

        mockMvc.perform(asJson(post("/api/workouts/" + workoutId + "/exercises/" + exerciseId + "/sets"),
                        userA, setBody(0, "501.00", 5, false, false)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(asJson(post("/api/workouts/" + workoutId + "/exercises/" + exerciseId + "/sets"),
                        userA, setBody(0, "100.00", 101, false, false)))
                .andExpect(status().isBadRequest());
    }

    private UUID startWorkout(TestUser user, String startedAt) throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(asJson(post("/api/workouts"), user, Map.of("id", id, "startedAt", startedAt)))
                .andExpect(status().isCreated());
        return id;
    }

    private UUID addExercise(TestUser user, UUID workoutId, UUID exerciseId, int orderIndex) throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(asJson(post("/api/workouts/" + workoutId + "/exercises"), user, Map.of(
                        "id", id, "exerciseId", exerciseId, "orderIndex", orderIndex)))
                .andExpect(status().isCreated());
        return id;
    }

    private void addSet(
            TestUser user,
            UUID workoutId,
            UUID workoutExerciseId,
            int setIndex,
            String weightKg,
            int reps,
            boolean warmup,
            boolean assisted
    ) throws Exception {
        MvcResult result = mockMvc.perform(asJson(
                        post("/api/workouts/" + workoutId + "/exercises/" + workoutExerciseId + "/sets"),
                        user, setBody(setIndex, weightKg, reps, warmup, assisted)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.get("id").asString()).isEqualTo(workoutId.toString());
    }

    private static Map<String, Object> setBody(
            int setIndex, String weightKg, int reps, boolean warmup, boolean assisted) {
        Map<String, Object> body = new HashMap<>();
        body.put("setIndex", setIndex);
        body.put("weightKg", weightKg);
        body.put("reps", reps);
        body.put("isWarmup", warmup);
        body.put("assisted", assisted);
        body.put("completedAt", "2026-09-01T16:1" + setIndex + ":00Z");
        return body;
    }

}
