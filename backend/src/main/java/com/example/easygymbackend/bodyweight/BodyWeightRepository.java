package com.example.easygymbackend.bodyweight;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BodyWeightRepository extends JpaRepository<BodyWeight, UUID> {

    @Query("SELECT b FROM BodyWeight b WHERE b.id = :id AND b.userId = :userId AND b.deletedAt IS NULL")
    Optional<BodyWeight> findVisibleTo(@Param("id") UUID id, @Param("userId") UUID userId);

    @Query("SELECT b FROM BodyWeight b WHERE b.userId = :userId AND b.deletedAt IS NULL ORDER BY b.measuredOn")
    List<BodyWeight> findAllVisibleTo(@Param("userId") UUID userId);

    /** Pod pull synchronizacji -- BEZ filtra deletedAt, tombstone'y muszą się zsynchronizować. */
    @Query("SELECT b FROM BodyWeight b WHERE b.userId = :userId AND b.updatedAt > :since")
    List<BodyWeight> findChangedSince(@Param("userId") UUID userId, @Param("since") Instant since);

}
