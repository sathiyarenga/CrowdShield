-- ============================================================================
-- 007_m5_crowd_behavior.sql — Module 5: Crowd Behavior
-- Pedestrian behavior profiles and simulation run metadata.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Behavior Profiles — pedestrian movement archetypes
-- ---------------------------------------------------------------------------
CREATE TABLE behavior_profiles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL UNIQUE,
    walking_speed       DOUBLE PRECISION,                -- m/s
    reaction_time       DOUBLE PRECISION,                -- seconds
    familiarity_level   DOUBLE PRECISION,                -- 0.0 (unfamiliar) to 1.0 (expert)
    group_size          INT DEFAULT 1 CHECK (group_size >= 1),
    herding_coefficient DOUBLE PRECISION,                -- 0.0 (independent) to 1.0 (full herding)
    description         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE behavior_profiles IS 'Pedestrian archetypes used in crowd simulations (speed, reaction, herding).';

CREATE TRIGGER set_behavior_profiles_updated_at
    BEFORE UPDATE ON behavior_profiles
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- Simulation Runs — crowd model executions
-- ---------------------------------------------------------------------------
CREATE TABLE simulation_runs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    model_type  TEXT NOT NULL DEFAULT 'agent_based',      -- agent_based, fluid, hybrid
    parameters  JSONB DEFAULT '{}'::jsonb,
    status      TEXT NOT NULL DEFAULT 'pending',           -- pending, running, completed, failed
    results     JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE simulation_runs IS 'Crowd simulation executions with input parameters and result summaries.';

CREATE INDEX idx_simulation_runs_event_id   ON simulation_runs (event_id);
CREATE INDEX idx_simulation_runs_status     ON simulation_runs (status);
CREATE INDEX idx_simulation_runs_parameters ON simulation_runs USING GIN (parameters);
CREATE INDEX idx_simulation_runs_results    ON simulation_runs USING GIN (results);

CREATE TRIGGER set_simulation_runs_updated_at
    BEFORE UPDATE ON simulation_runs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
