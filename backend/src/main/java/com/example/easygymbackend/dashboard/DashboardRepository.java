package com.example.easygymbackend.dashboard;

import com.example.easygymbackend.dashboard.dto.DailyWorkoutCount;
import com.example.easygymbackend.dashboard.dto.WeeklyMuscleGroupVolume;
import com.example.easygymbackend.metrics.IsoWeek;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Prawdziwa agregacja SQL (sekcja 9 promptu: "nie ściągaj wszystkich serii
 * żeby liczyć w pamięci") -- w odróżnieniu od ExerciseProgressService/
 * "ostatnie PR", gdzie zakres (jedno ćwiczenie / PR per ćwiczenie) jest z
 * natury mały. Tu zakres to CAŁA historia treningowa usera pocięta na
 * tygodnie/dni -- dokładnie ten przypadek, o który chodziło w sekcji 9.
 */
@Repository
public class DashboardRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public DashboardRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Bucketing po tygodniu ISO w strefie Europe/Warsaw, tak jak wszędzie
     * indziej w tym projekcie (IsoWeek, TrendComparator) -- date_trunc('week', ...)
     * w Postgresie już jest ISO (poniedziałek-start), ale trzeba przeliczyć
     * started_at na czas lokalny PRZED ucięciem, inaczej granica dnia/tygodnia
     * liczy się w UTC, nie w Warszawie. Objętość wliczaj assisted (jak
     * SessionMetrics.displayVolumeKg), wyklucza tylko rozgrzewkę.
     */
    public List<WeeklyMuscleGroupVolume> weeklyVolumeByMuscleGroup(UUID userId, LocalDate from) {
        String sql = """
                SELECT
                    date_trunc('week', w.started_at AT TIME ZONE 'Europe/Warsaw')::date AS week_start,
                    e.muscle_group AS muscle_group,
                    SUM(s.weight_kg * s.reps) AS volume_kg,
                    bool_or(w.is_deload) AS any_deload
                FROM sets s
                JOIN workout_exercises we ON we.id = s.workout_exercise_id
                JOIN workouts w ON w.id = we.workout_id
                JOIN exercises e ON e.id = we.exercise_id
                WHERE w.user_id = :userId
                  AND s.deleted_at IS NULL
                  AND we.deleted_at IS NULL
                  AND w.deleted_at IS NULL
                  AND s.is_warmup = false
                  AND w.started_at >= :from
                GROUP BY week_start, e.muscle_group
                ORDER BY week_start, e.muscle_group
                """;

        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("userId", userId)
                .addValue("from", Date.valueOf(from));

        return jdbc.query(sql, params, (rs, rowNum) -> new WeeklyMuscleGroupVolume(
                IsoWeek.of(rs.getDate("week_start").toLocalDate()),
                rs.getString("muscle_group"),
                rs.getBigDecimal("volume_kg"),
                rs.getBoolean("any_deload")));
    }

    public List<DailyWorkoutCount> workoutsByDay(UUID userId, LocalDate from) {
        String sql = """
                SELECT
                    (w.started_at AT TIME ZONE 'Europe/Warsaw')::date AS workout_date,
                    count(*) AS workout_count,
                    bool_or(w.is_deload) AS any_deload
                FROM workouts w
                WHERE w.user_id = :userId
                  AND w.deleted_at IS NULL
                  AND w.started_at >= :from
                GROUP BY workout_date
                ORDER BY workout_date
                """;

        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("userId", userId)
                .addValue("from", Date.valueOf(from));

        return jdbc.query(sql, params, (rs, rowNum) -> new DailyWorkoutCount(
                rs.getDate("workout_date").toLocalDate(),
                rs.getInt("workout_count"),
                rs.getBoolean("any_deload")));
    }

}
