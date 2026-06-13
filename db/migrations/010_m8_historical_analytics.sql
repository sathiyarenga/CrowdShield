-- ============================================================================
-- 010_m8_historical_analytics.sql — Module 8: Historical Analytics
-- Event fingerprints, mobility patterns, benchmarks, and anomaly baselines.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Event Fingerprints — summary statistics for completed events
-- ---------------------------------------------------------------------------
CREATE TABLE event_fingerprints (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id                  UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    venue_id                  UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    event_type                TEXT NOT NULL,
    ingress_onset             TIMESTAMPTZ,
    ingress_duration_min      INT,
    peak_time                 TIMESTAMPTZ,
    peak_count                INT,
    egress_onset              TIMESTAMPTZ,
    egress_duration_min       INT,
    clearance_time_min        INT,
    total_attendance_estimate INT,
    metadata                  JSONB DEFAULT '{}'::jsonb,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE event_fingerprints IS 'Post-event summary: ingress/egress timing, peak counts, attendance estimates.';

CREATE INDEX idx_fingerprints_event_id   ON event_fingerprints (event_id);
CREATE INDEX idx_fingerprints_venue_id   ON event_fingerprints (venue_id);
CREATE INDEX idx_fingerprints_event_type ON event_fingerprints (event_type);
CREATE INDEX idx_fingerprints_metadata   ON event_fingerprints USING GIN (metadata);

CREATE TRIGGER set_event_fingerprints_updated_at
    BEFORE UPDATE ON event_fingerprints
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- Mobility Patterns — recurring flow patterns per zone/time-of-day
-- ---------------------------------------------------------------------------
CREATE TABLE mobility_patterns (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id           UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    time_window_start TIME NOT NULL,
    time_window_end   TIME NOT NULL,
    day_type          TEXT NOT NULL,                       -- weekday, weekend, holiday, event_day
    metric            metric_type NOT NULL,
    mean              DOUBLE PRECISION NOT NULL,
    std_dev           DOUBLE PRECISION NOT NULL,
    percentile_95     DOUBLE PRECISION NOT NULL,
    sample_count      INT NOT NULL CHECK (sample_count > 0),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE mobility_patterns IS 'Statistical summaries of recurring crowd metrics by zone, time window, and day type.';

CREATE INDEX idx_mobility_zone_id ON mobility_patterns (zone_id);
CREATE INDEX idx_mobility_metric  ON mobility_patterns (metric);
CREATE INDEX idx_mobility_day     ON mobility_patterns (day_type);

CREATE TRIGGER set_mobility_patterns_updated_at
    BEFORE UPDATE ON mobility_patterns
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- Crowd Benchmarks — cross-event comparative metrics
-- ---------------------------------------------------------------------------
CREATE TABLE crowd_benchmarks (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type        TEXT NOT NULL,
    metric            TEXT NOT NULL,
    value             DOUBLE PRECISION NOT NULL,
    confidence        DOUBLE PRECISION CHECK (confidence >= 0 AND confidence <= 1),
    comparable_events INT CHECK (comparable_events >= 0),
    description       TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE crowd_benchmarks IS 'Industry / historical benchmarks for crowd metrics by event type.';

CREATE INDEX idx_benchmarks_event_type ON crowd_benchmarks (event_type);

CREATE TRIGGER set_crowd_benchmarks_updated_at
    BEFORE UPDATE ON crowd_benchmarks
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- Anomaly Baselines — expected values per zone/hour for anomaly detection
-- ---------------------------------------------------------------------------
CREATE TABLE anomaly_baselines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id         UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    hour_of_day     INT NOT NULL CHECK (hour_of_day >= 0 AND hour_of_day <= 23),
    day_type        TEXT NOT NULL,
    expected_value  DOUBLE PRECISION NOT NULL,
    std_dev         DOUBLE PRECISION NOT NULL,
    threshold_sigma DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE anomaly_baselines IS 'Per-zone hourly baselines for real-time anomaly detection (value ± threshold_sigma × std_dev).';

CREATE INDEX idx_baselines_zone_id ON anomaly_baselines (zone_id);
CREATE INDEX idx_baselines_hour    ON anomaly_baselines (hour_of_day);

CREATE TRIGGER set_anomaly_baselines_updated_at
    BEFORE UPDATE ON anomaly_baselines
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
