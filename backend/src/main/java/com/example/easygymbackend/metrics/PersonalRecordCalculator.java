package com.example.easygymbackend.metrics;

import java.math.BigDecimal;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * PRs in three categories (weight, e1RM, session volume) + per rep range --
 * all with is_warmup and assisted sets excluded (section 4 of the prompt).
 * Sessions must come in chronological order -- on a tie the record stays with
 * the FIRST occurrence (a later equal value does not beat it), so "breaking
 * a record" = strictly greater value, not a tie.
 */
public final class PersonalRecordCalculator {

    private PersonalRecordCalculator() {
    }

    public record Session(UUID workoutId, List<ExerciseSet> sets) {
    }

    public static PersonalRecords compute(List<Session> chronologicalSessions, OneRepMaxFormula formula) {
        Optional<PersonalRecords.PersonalRecordEntry> maxWeight = Optional.empty();
        Optional<PersonalRecords.PersonalRecordEntry> maxE1rm = Optional.empty();
        Optional<PersonalRecords.SessionVolumeRecord> maxVolume = Optional.empty();
        Map<RepRangeBucket, PersonalRecords.PersonalRecordEntry> byRepRange = new EnumMap<>(RepRangeBucket.class);

        for (Session session : chronologicalSessions) {
            BigDecimal sessionVolume = SessionMetrics.prEligibleVolumeKg(session.sets());
            if (maxVolume.isEmpty() || sessionVolume.compareTo(maxVolume.get().value()) > 0) {
                maxVolume = Optional.of(new PersonalRecords.SessionVolumeRecord(session.workoutId(), sessionVolume));
            }

            for (ExerciseSet set : session.sets()) {
                if (set.isWarmup() || set.assisted()) {
                    continue;
                }

                if (maxWeight.isEmpty() || set.weightKg().compareTo(maxWeight.get().value()) > 0) {
                    maxWeight = Optional.of(new PersonalRecords.PersonalRecordEntry(set.setId(), set.weightKg()));
                }

                Optional<BigDecimal> e1rm = OneRepMax.estimate(set.weightKg(), set.reps(), formula);
                if (e1rm.isPresent() && (maxE1rm.isEmpty() || e1rm.get().compareTo(maxE1rm.get().value()) > 0)) {
                    maxE1rm = Optional.of(new PersonalRecords.PersonalRecordEntry(set.setId(), e1rm.get()));
                }

                RepRangeBucket bucket = RepRangeBucket.fromReps(set.reps());
                PersonalRecords.PersonalRecordEntry currentBucketRecord = byRepRange.get(bucket);
                if (currentBucketRecord == null || set.weightKg().compareTo(currentBucketRecord.value()) > 0) {
                    byRepRange.put(bucket, new PersonalRecords.PersonalRecordEntry(set.setId(), set.weightKg()));
                }
            }
        }

        return new PersonalRecords(maxWeight, maxE1rm, maxVolume, byRepRange);
    }

    /**
     * PRs broken in the LAST session of the list (must be chronological) --
     * feeds the "PR broken" banner in the workout summary (section 3.6) and
     * the "is PR" column in the XLSX export (section 7, Sets sheet), using
     * the same algorithm as {@link #compute}, so no duplication of rules.
     */
    public static PersonalRecords brokenIn(List<Session> chronologicalSessions, OneRepMaxFormula formula) {
        if (chronologicalSessions.isEmpty()) {
            return PersonalRecords.empty();
        }

        Session latest = chronologicalSessions.get(chronologicalSessions.size() - 1);
        PersonalRecords after = compute(chronologicalSessions, formula);

        Set<UUID> latestSetIds = latest.sets().stream().map(ExerciseSet::setId).collect(Collectors.toSet());

        Optional<PersonalRecords.PersonalRecordEntry> weightBroken = after.maxWeight()
                .filter(entry -> latestSetIds.contains(entry.setId()));
        Optional<PersonalRecords.PersonalRecordEntry> e1rmBroken = after.maxE1rm()
                .filter(entry -> latestSetIds.contains(entry.setId()));
        Optional<PersonalRecords.SessionVolumeRecord> volumeBroken = after.maxSessionVolume()
                .filter(record -> record.workoutId().equals(latest.workoutId()));

        Map<RepRangeBucket, PersonalRecords.PersonalRecordEntry> repRangeBroken = after.byRepRange().entrySet().stream()
                .filter(entry -> latestSetIds.contains(entry.getValue().setId()))
                .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        Map.Entry::getValue,
                        (a, b) -> a,
                        () -> new EnumMap<>(RepRangeBucket.class)));

        return new PersonalRecords(weightBroken, e1rmBroken, volumeBroken, repRangeBroken);
    }

}
