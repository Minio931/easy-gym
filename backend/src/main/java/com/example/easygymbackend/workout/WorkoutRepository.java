package com.example.easygymbackend.workout;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkoutRepository extends JpaRepository<Workout, UUID> {

    @Query("""
            SELECT w FROM Workout w
            WHERE w.id = :id AND w.userId = :userId AND w.deletedAt IS NULL
            """)
    Optional<Workout> findVisibleTo(@Param("id") UUID id, @Param("userId") UUID userId);

    @Query("""
            SELECT w FROM Workout w
            WHERE w.userId = :userId AND w.deletedAt IS NULL
            ORDER BY w.startedAt DESC
            """)
    List<Workout> findAllVisibleTo(@Param("userId") UUID userId);

}
