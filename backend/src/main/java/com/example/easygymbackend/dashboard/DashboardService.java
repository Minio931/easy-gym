package com.example.easygymbackend.dashboard;

import com.example.easygymbackend.bodyweight.BodyWeightService;
import com.example.easygymbackend.dashboard.dto.DashboardResponse;
import com.example.easygymbackend.metrics.IsoWeek;
import com.example.easygymbackend.metrics.TrendComparator;
import com.example.easygymbackend.workout.WorkoutRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

@Service
public class DashboardService {

    private static final int DEFAULT_RECENT_PR_LIMIT = 10;

    /**
     * Ostatnie pobicia rekordu ciężaru per ćwiczenie. Funkcja okna liczy
     * "maksimum ze WSZYSTKICH wcześniejszych serii" -- rekord to ściśle
     * większy ciężar niż dotychczasowy (remis nie liczy się, tak samo jak w
     * PersonalRecordCalculator). Rozgrzewka i assisted wykluczone.
     */
    private static final String RECENT_PR_SQL = """
            SELECT t.set_id, t.exercise_id, t.exercise_name, t.weight_kg, t.reps, t.completed_at, t.workout_id
            FROM (
                SELECT s.id AS set_id,
                       e.id AS exercise_id,
                       e.name AS exercise_name,
                       s.weight_kg,
                       s.reps,
                       s.completed_at,
                       w.id AS workout_id,
                       max(s.weight_kg) OVER (
                           PARTITION BY e.id
                           ORDER BY s.completed_at, s.id
                           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_max
                FROM sets s
                    JOIN workout_exercises we ON we.id = s.workout_exercise_id AND we.deleted_at IS NULL
                    JOIN workouts w ON w.id = we.workout_id AND w.deleted_at IS NULL
                    JOIN exercises e ON e.id = we.exercise_id
                WHERE s.deleted_at IS NULL
                  AND s.is_warmup = false
                  AND s.assisted = false
                  AND w.user_id = ?
            ) t
            WHERE t.prev_max IS NULL OR t.weight_kg > t.prev_max
            ORDER BY t.completed_at DESC
            LIMIT ?
            """;

    private static final String WORKOUT_DAYS_SQL = """
            SELECT (w.started_at AT TIME ZONE 'Europe/Warsaw')::date AS day, count(*) AS workout_count
            FROM workouts w
            WHERE w.user_id = ?
              AND w.deleted_at IS NULL
              AND w.started_at >= ?
              AND w.started_at < ?
            GROUP BY 1
            ORDER BY 1
            """;

    private final WorkoutRepository workoutRepository;
    private final BodyWeightService bodyWeightService;
    private final JdbcTemplate jdbcTemplate;

    public DashboardService(
            WorkoutRepository workoutRepository,
            BodyWeightService bodyWeightService,
            JdbcTemplate jdbcTemplate
    ) {
        this.workoutRepository = workoutRepository;
        this.bodyWeightService = bodyWeightService;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional(readOnly = true)
    public DashboardResponse build(UUID userId, Instant from, Instant to, boolean includeDeload) {
        List<MuscleGroupVolumeRow> rows = workoutRepository.findMuscleGroupVolume(userId, from, to);

        List<DashboardResponse.WeeklyVolume> weekly = weeklyVolume(rows);
        List<DashboardResponse.WorkoutDay> days = workoutDays(userId, from, to);

        return new DashboardResponse(
                from,
                to,
                totals(userId, from, to, rows),
                weekly,
                volumeTrend(weekly, includeDeload),
                days,
                workoutsPerMonth(days),
                recentPersonalRecords(userId, DEFAULT_RECENT_PR_LIMIT),
                bodyWeightService.stats(
                        userId,
                        LocalDate.ofInstant(from, IsoWeek.WARSAW),
                        LocalDate.ofInstant(to, IsoWeek.WARSAW)));
    }

    private DashboardResponse.Totals totals(
            UUID userId, Instant from, Instant to, List<MuscleGroupVolumeRow> rows) {
        BigDecimal volume = rows.stream()
                .map(MuscleGroupVolumeRow::volumeKg)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        long setCount = rows.stream().mapToLong(MuscleGroupVolumeRow::setCount).sum();
        return new DashboardResponse.Totals(workoutRepository.countInRange(userId, from, to), setCount, volume);
    }

    private static List<DashboardResponse.WeeklyVolume> weeklyVolume(List<MuscleGroupVolumeRow> rows) {
        Map<IsoWeek, Map<String, BigDecimal>> byWeek = new TreeMap<>();
        Map<IsoWeek, Set<UUID>> workoutsPerWeek = new TreeMap<>();
        Map<IsoWeek, Boolean> deloadWeeks = new TreeMap<>();

        for (MuscleGroupVolumeRow row : rows) {
            IsoWeek week = IsoWeek.ofInstant(row.startedAt());
            byWeek.computeIfAbsent(week, key -> new LinkedHashMap<>())
                    .merge(row.muscleGroup(), row.volumeKg(), BigDecimal::add);
            workoutsPerWeek.computeIfAbsent(week, key -> new HashSet<>()).add(row.workoutId());
            deloadWeeks.merge(week, row.deload(), (a, b) -> a || b);
        }

        List<DashboardResponse.WeeklyVolume> result = new ArrayList<>();
        for (Map.Entry<IsoWeek, Map<String, BigDecimal>> entry : byWeek.entrySet()) {
            IsoWeek week = entry.getKey();
            Map<String, BigDecimal> groups = new LinkedHashMap<>(entry.getValue());
            BigDecimal total = groups.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
            result.add(new DashboardResponse.WeeklyVolume(
                    week.year(),
                    week.week(),
                    week.mondayStart(),
                    week.sundayEnd(),
                    total,
                    groups,
                    workoutsPerWeek.getOrDefault(week, Set.of()).size(),
                    Boolean.TRUE.equals(deloadWeeks.get(week))));
        }
        return result;
    }

    /**
     * Domyślnie tygodnie deload wypadają z łańcucha porównań -- tydzień po
     * deloadzie porównuje się do ostatniego tygodnia NIE-deload przed nim
     * (TrendComparator). includeDeload=true wyłącza to zachowanie.
     */
    private static DashboardResponse.Trend volumeTrend(
            List<DashboardResponse.WeeklyVolume> weekly, boolean includeDeload) {
        if (weekly.isEmpty()) {
            return null;
        }
        List<TrendComparator.WeeklyValue> values = weekly.stream()
                .map(week -> new TrendComparator.WeeklyValue(
                        new IsoWeek(week.year(), week.week()), week.totalKg(), week.isDeload()))
                .toList();

        DashboardResponse.WeeklyVolume last = weekly.get(weekly.size() - 1);
        return TrendComparator
                .compareToPreviousWeek(values, new IsoWeek(last.year(), last.week()), includeDeload)
                .map(result -> new DashboardResponse.Trend(
                        result.previousValue(), result.currentValue(), result.deltaPercent()))
                .orElse(null);
    }

    private List<DashboardResponse.WorkoutDay> workoutDays(UUID userId, Instant from, Instant to) {
        return jdbcTemplate.query(
                WORKOUT_DAYS_SQL,
                (rs, rowNum) -> new DashboardResponse.WorkoutDay(
                        rs.getObject("day", LocalDate.class), rs.getLong("workout_count")),
                userId, Timestamp.from(from), Timestamp.from(to));
    }

    private static List<DashboardResponse.MonthlyWorkouts> workoutsPerMonth(
            List<DashboardResponse.WorkoutDay> days) {
        Map<String, Long> byMonth = new TreeMap<>();
        for (DashboardResponse.WorkoutDay day : days) {
            byMonth.merge(day.date().toString().substring(0, 7), day.workoutCount(), Long::sum);
        }
        return byMonth.entrySet().stream()
                .map(entry -> new DashboardResponse.MonthlyWorkouts(entry.getKey(), entry.getValue()))
                .sorted(Comparator.comparing(DashboardResponse.MonthlyWorkouts::month))
                .toList();
    }

    private List<DashboardResponse.RecentPersonalRecord> recentPersonalRecords(UUID userId, int limit) {
        return jdbcTemplate.query(
                RECENT_PR_SQL,
                (rs, rowNum) -> new DashboardResponse.RecentPersonalRecord(
                        rs.getObject("set_id", UUID.class),
                        rs.getObject("exercise_id", UUID.class),
                        rs.getString("exercise_name"),
                        rs.getBigDecimal("weight_kg"),
                        rs.getInt("reps"),
                        rs.getTimestamp("completed_at").toInstant(),
                        rs.getObject("workout_id", UUID.class)),
                userId, limit);
    }

}
