package com.example.easygymbackend.routine;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RoutineRepository extends JpaRepository<Routine, UUID> {

    List<Routine> findByUserIdAndDeletedAtIsNullOrderByNameAsc(UUID userId);

    Optional<Routine> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    Optional<Routine> findByIdAndUserId(UUID id, UUID userId);

    @Query("select r.id from Routine r where r.id in :ids and r.userId = :userId")
    List<UUID> findOwnedIds(@Param("userId") UUID userId, @Param("ids") Collection<UUID> ids);

    List<Routine> findByUserIdAndUpdatedAtAfter(UUID userId, Instant since);

    List<Routine> findByUserIdAndIdIn(UUID userId, Collection<UUID> ids);

}
