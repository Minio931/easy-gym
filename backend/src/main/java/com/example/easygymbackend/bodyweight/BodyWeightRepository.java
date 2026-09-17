package com.example.easygymbackend.bodyweight;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BodyWeightRepository extends JpaRepository<BodyWeight, UUID> {

    List<BodyWeight> findByUserIdAndDeletedAtIsNullAndMeasuredOnBetweenOrderByMeasuredOnAsc(
            UUID userId, LocalDate from, LocalDate to);

    Optional<BodyWeight> findByUserIdAndMeasuredOnAndDeletedAtIsNull(UUID userId, LocalDate measuredOn);

    Optional<BodyWeight> findByIdAndUserId(UUID id, UUID userId);

    List<BodyWeight> findByUserIdAndUpdatedAtAfter(UUID userId, Instant since);

    List<BodyWeight> findByUserIdAndIdIn(UUID userId, Collection<UUID> ids);

}
