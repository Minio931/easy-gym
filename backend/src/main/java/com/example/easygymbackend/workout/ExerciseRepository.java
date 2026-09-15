package com.example.easygymbackend.workout;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ExerciseRepository extends JpaRepository<Exercise, UUID> {

    /**
     * Globalne (user_id IS NULL) + własne usera, bez usuniętych. Filtr
     * opcjonalny po nazwie (ILIKE, prosty substring match -- pg_trgm index z
     * V1/V3 przyda się później pod fuzzy ranking, na razie wystarcza).
     */
    @Query("""
            SELECT e FROM Exercise e
            WHERE (e.userId IS NULL OR e.userId = :userId)
              AND e.deletedAt IS NULL
              AND (:search IS NULL OR LOWER(e.name) LIKE LOWER(CONCAT('%', :search, '%')))
            ORDER BY e.name
            """)
    List<Exercise> findVisibleTo(@Param("userId") UUID userId, @Param("search") String search);

    @Query("""
            SELECT e FROM Exercise e
            WHERE e.id = :id
              AND (e.userId IS NULL OR e.userId = :userId)
              AND e.deletedAt IS NULL
            """)
    Optional<Exercise> findVisibleTo(@Param("id") UUID id, @Param("userId") UUID userId);

}
