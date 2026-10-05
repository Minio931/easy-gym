-- All tables below are entities synchronized from the offline client (Dexie).
-- Conventions common to sync (last-write-wins by updated_at), absent from the
-- spec literally but required for sync to work at all:
--   * id UUID -- generated on the client side, PK has no DEFAULT (except for
--     records created only on the server, e.g. the exercise seed)
--   * updated_at TIMESTAMPTZ -- bumped on every change, LWW key
--   * deleted_at TIMESTAMPTZ NULL -- soft delete / tombstone; an offline
--     delete also has to sync, so we don't DELETE FROM; we only set
--     deleted_at (and bump updated_at)

CREATE TABLE exercises (
    id            UUID PRIMARY KEY,
    user_id       UUID REFERENCES users (id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    muscle_group  TEXT NOT NULL,
    equipment     TEXT NOT NULL,
    is_archived   BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ,
    CONSTRAINT chk_exercises_equipment CHECK (
        equipment IN ('barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other')
    )
);

-- user_id IS NULL = global exercise (seed), visible to every user.
CREATE INDEX idx_exercises_user_id ON exercises (user_id);
CREATE INDEX idx_exercises_name_trgm ON exercises USING gin (name gin_trgm_ops);

CREATE TABLE routines (
    id         UUID PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    notes      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_routines_user_id ON routines (user_id);

CREATE TABLE routine_items (
    id           UUID PRIMARY KEY,
    routine_id   UUID NOT NULL REFERENCES routines (id) ON DELETE CASCADE,
    exercise_id  UUID NOT NULL REFERENCES exercises (id),
    order_index  INT NOT NULL,
    target_sets  INT,
    target_reps  INT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ
);

CREATE INDEX idx_routine_items_routine_id ON routine_items (routine_id);

CREATE TABLE workouts (
    id         UUID PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at   TIMESTAMPTZ,
    routine_id UUID REFERENCES routines (id) ON DELETE SET NULL,
    notes      TEXT,
    is_deload  BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_workouts_user_id_started_at ON workouts (user_id, started_at);

CREATE TABLE workout_exercises (
    id          UUID PRIMARY KEY,
    workout_id  UUID NOT NULL REFERENCES workouts (id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES exercises (id),
    order_index INT NOT NULL,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX idx_workout_exercises_workout_id ON workout_exercises (workout_id);

CREATE TABLE sets (
    id                    UUID PRIMARY KEY,
    workout_exercise_id   UUID NOT NULL REFERENCES workout_exercises (id) ON DELETE CASCADE,
    set_index             INT NOT NULL,
    weight_kg             NUMERIC(6, 2) NOT NULL,
    reps                  INT NOT NULL,
    rpe                   NUMERIC(3, 1),
    is_warmup             BOOLEAN NOT NULL DEFAULT false,
    to_failure            BOOLEAN NOT NULL DEFAULT false,
    assisted              BOOLEAN NOT NULL DEFAULT false,
    completed_at          TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at            TIMESTAMPTZ,
    CONSTRAINT chk_sets_weight_kg CHECK (weight_kg >= 0 AND weight_kg <= 500),
    CONSTRAINT chk_sets_reps CHECK (reps >= 1 AND reps <= 100),
    CONSTRAINT chk_sets_rpe CHECK (rpe IS NULL OR (rpe >= 1 AND rpe <= 10))
);

CREATE INDEX idx_sets_workout_exercise_id_set_index ON sets (workout_exercise_id, set_index);

CREATE TABLE body_weights (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    measured_on DATE NOT NULL,
    weight_kg   NUMERIC(5, 2) NOT NULL,
    note        TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ,
    CONSTRAINT chk_body_weights_weight_kg CHECK (weight_kg > 0 AND weight_kg < 400)
);

-- "One entry per day" uniqueness only across live records -- a plain
-- UNIQUE(user_id, measured_on) would block adding a new entry after deleting
-- the old one on the same day (a soft-deleted row would still "occupy" the date).
CREATE UNIQUE INDEX uq_body_weights_user_measured_on
    ON body_weights (user_id, measured_on) WHERE deleted_at IS NULL;

CREATE INDEX idx_body_weights_user_id_measured_on ON body_weights (user_id, measured_on);
