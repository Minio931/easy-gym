package com.example.easygymbackend.dashboard;

import com.example.easygymbackend.support.ApiIntegrationTest;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DashboardApiTest extends ApiIntegrationTest {

    private static final UUID BENCH_PRESS = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID DEADLIFT = UUID.fromString("00000000-0000-0000-0000-000000000009");

    @Test
    void agregujeObjetoscTygodniowaPerGrupaMiesniowaIOstatniePr() throws Exception {
        Instant recent = Instant.now().minus(2, ChronoUnit.HOURS);
        UUID workoutId = startWorkout(userA, recent);
        addSets(userA, workoutId, BENCH_PRESS, "100.00", 5);
        addSets(userA, workoutId, DEADLIFT, "140.00", 3);

        mockMvc.perform(as(get("/api/dashboard"), userA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totals.workoutCount").value(1))
                .andExpect(jsonPath("$.totals.workingSetCount").value(2))
                // 100x5 + 140x3 = 920
                .andExpect(jsonPath("$.totals.volumeKg").value(920.00))
                .andExpect(jsonPath("$.weeklyVolume[-1:].byMuscleGroup['klatka piersiowa']")
                        .value(org.hamcrest.Matchers.contains(500.00)))
                .andExpect(jsonPath("$.weeklyVolume[-1:].byMuscleGroup['plecy']")
                        .value(org.hamcrest.Matchers.contains(420.00)))
                .andExpect(jsonPath("$.workoutDays.length()").value(1))
                .andExpect(jsonPath("$.workoutsPerMonth.length()").value(1))
                // Pierwsze wykonanie każdego ćwiczenia jest z definicji rekordem.
                .andExpect(jsonPath("$.recentPersonalRecords.length()").value(2));
    }

    @Test
    void pulpitInnegoUseraJestPusty() throws Exception {
        UUID workoutId = startWorkout(userA, Instant.now().minus(2, ChronoUnit.HOURS));
        addSets(userA, workoutId, BENCH_PRESS, "100.00", 5);

        mockMvc.perform(as(get("/api/dashboard"), userB))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totals.workoutCount").value(0))
                .andExpect(jsonPath("$.totals.volumeKg").value(0))
                .andExpect(jsonPath("$.weeklyVolume.length()").value(0))
                .andExpect(jsonPath("$.recentPersonalRecords.length()").value(0))
                .andExpect(jsonPath("$.bodyWeight.entries.length()").value(0));
    }

    private UUID startWorkout(TestUser user, Instant startedAt) throws Exception {
        UUID id = UUID.randomUUID();
        mockMvc.perform(asJson(post("/api/workouts"), user, Map.of(
                        "id", id, "startedAt", startedAt.toString())))
                .andExpect(status().isCreated());
        return id;
    }

    private void addSets(TestUser user, UUID workoutId, UUID exerciseId, String weightKg, int reps)
            throws Exception {
        UUID workoutExerciseId = UUID.randomUUID();
        mockMvc.perform(asJson(post("/api/workouts/" + workoutId + "/exercises"), user, Map.of(
                        "id", workoutExerciseId, "exerciseId", exerciseId, "orderIndex", 0)))
                .andExpect(status().isCreated());

        Map<String, Object> body = new HashMap<>();
        body.put("setIndex", 0);
        body.put("weightKg", weightKg);
        body.put("reps", reps);
        body.put("isWarmup", false);
        body.put("assisted", false);
        mockMvc.perform(asJson(
                        post("/api/workouts/" + workoutId + "/exercises/" + workoutExerciseId + "/sets"),
                        user, body))
                .andExpect(status().isCreated());
    }

}
