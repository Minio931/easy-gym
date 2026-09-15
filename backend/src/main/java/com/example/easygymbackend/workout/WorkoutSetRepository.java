package com.example.easygymbackend.workout;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkoutSetRepository extends JpaRepository<WorkoutSet, UUID> {

    /** Izolacja tranzytywna: set -> workout_exercise -> workout.user_id. */
    @Query("""
            SELECT s FROM WorkoutSet s
            WHERE s.id = :id AND s.workoutExercise.workout.userId = :userId AND s.deletedAt IS NULL
            """)
    Optional<WorkoutSet> findVisibleTo(@Param("id") UUID id, @Param("userId") UUID userId);

    @Query("""
            SELECT s FROM WorkoutSet s
            WHERE s.workoutExercise.id = :workoutExerciseId
              AND s.workoutExercise.workout.userId = :userId
              AND s.deletedAt IS NULL
            ORDER BY s.setIndex
            """)
    List<WorkoutSet> findAllVisibleTo(@Param("workoutExerciseId") UUID workoutExerciseId, @Param("userId") UUID userId);

    /** Pod pull synchronizacji -- BEZ filtra deletedAt, tombstone'y muszą się zsynchronizować. */
    @Query("""
            SELECT s FROM WorkoutSet s
            WHERE s.workoutExercise.workout.userId = :userId AND s.updatedAt > :since
            """)
    List<WorkoutSet> findChangedSince(@Param("userId") UUID userId, @Param("since") Instant since);

    /**
     * Pod ekran ćwiczenia (etap 6) -- wszystkie serie dla jednego ćwiczenia
     * w całej historii usera, posortowane chronologicznie (data sesji, potem
     * kolejność w sesji). Grupowanie po sesji (workout) robi warstwa serwisu,
     * nie SQL -- to niewielki zbiór (jedno ćwiczenie, jeden user), więc czyste
     * funkcje z pakietu metrics są właściwym narzędziem, nie GROUP BY w bazie
     * (to drugie dopiero przy agregacjach na skalę "cała historia", etap 8).
     */
    @Query("""
            SELECT s FROM WorkoutSet s
            WHERE s.workoutExercise.exercise.id = :exerciseId
              AND s.workoutExercise.workout.userId = :userId
              AND s.deletedAt IS NULL
              AND s.workoutExercise.deletedAt IS NULL
              AND s.workoutExercise.workout.deletedAt IS NULL
            ORDER BY s.workoutExercise.workout.startedAt, s.setIndex
            """)
    List<WorkoutSet> findAllForExercise(@Param("exerciseId") UUID exerciseId, @Param("userId") UUID userId);

    /**
     * Pod "ostatnie PR" na dashboardzie (etap 8) -- wszystkie serie usera,
     * WSZYSTKICH ćwiczeń, posortowane najpierw po ćwiczeniu (żeby grupowanie
     * per-exercise w serwisie było jednym przejściem), potem chronologicznie.
     * PR-y liczy się per ćwiczenie (pakiet metrics), więc to nadal "dane
     * jednego usera", nie SUM/GROUP BY w bazie -- w odróżnieniu od objętości
     * tygodniowej/kalendarza (DashboardRepository), gdzie sekcja 9 promptu
     * wprost każe agregować w zapytaniu.
     */
    @Query("""
            SELECT s FROM WorkoutSet s
            WHERE s.workoutExercise.workout.userId = :userId
              AND s.deletedAt IS NULL
              AND s.workoutExercise.deletedAt IS NULL
              AND s.workoutExercise.workout.deletedAt IS NULL
            ORDER BY s.workoutExercise.exercise.id, s.workoutExercise.workout.startedAt, s.setIndex
            """)
    List<WorkoutSet> findAllForUser(@Param("userId") UUID userId);

}
