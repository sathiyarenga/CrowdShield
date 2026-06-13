-- ============================================================================
-- 006_m4_observation_sensor.sql — Module 4: Observation & Sensor
-- Time-series crowd data via TimescaleDB hypertables.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Data Sources — sensor / feed configurations
-- ---------------------------------------------------------------------------
CREATE TABLE data_sources (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    source_type data_source_type NOT NULL,
    config      JSONB DEFAULT '{}'::jsonb,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE data_sources IS 'Registered data feeds: telecom mobility, cameras, weather APIs, etc.';

CREATE INDEX idx_data_sources_type   ON data_sources (source_type);
CREATE INDEX idx_data_sources_config ON data_sources USING GIN (config);

CREATE TRIGGER set_data_sources_updated_at
    BEFORE UPDATE ON data_sources
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- Observations — 5-minute interval crowd metrics (HYPERTABLE)
-- ---------------------------------------------------------------------------
-- NOTE: Hypertables cannot have UUID PKs; use (time, zone_id, data_source_id, metric) as natural key.
CREATE TABLE observations (
    time            TIMESTAMPTZ NOT NULL,
    zone_id         UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    data_source_id  UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    metric          metric_type NOT NULL,
    value           DOUBLE PRECISION NOT NULL,
    metadata        JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE observations IS 'Time-series crowd/environmental metrics at 5-min intervals. TimescaleDB hypertable.';

-- Convert to hypertable partitioned by time (7-day chunks)
SELECT create_hypertable(
    'observations',
    by_range('time', INTERVAL '7 days')
);

-- Composite indexes for typical query patterns
CREATE INDEX idx_observations_zone_time   ON observations (zone_id, time DESC);
CREATE INDEX idx_observations_source_time ON observations (data_source_id, time DESC);
CREATE INDEX idx_observations_metric      ON observations (metric, time DESC);
CREATE INDEX idx_observations_metadata    ON observations USING GIN (metadata);

-- ---------------------------------------------------------------------------
-- Observations Nationality — per-country crowd counts (HYPERTABLE)
-- ---------------------------------------------------------------------------
CREATE TABLE observations_nationality (
    time            TIMESTAMPTZ NOT NULL,
    zone_id         UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    data_source_id  UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
    country_code    CHAR(2) NOT NULL,                   -- ISO 3166-1 alpha-2
    country_name    TEXT NOT NULL,
    people_count    INT NOT NULL CHECK (people_count >= 0)
);

COMMENT ON TABLE observations_nationality IS 'Nationality-disaggregated crowd counts. TimescaleDB hypertable.';

SELECT create_hypertable(
    'observations_nationality',
    by_range('time', INTERVAL '7 days')
);

CREATE INDEX idx_obs_nat_zone_time    ON observations_nationality (zone_id, time DESC);
CREATE INDEX idx_obs_nat_country_time ON observations_nationality (country_code, time DESC);
