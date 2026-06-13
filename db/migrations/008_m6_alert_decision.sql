-- ============================================================================
-- 008_m6_alert_decision.sql — Module 6: Alert & Decision Support
-- Real-time alerts and recommended actions.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Alerts
-- ---------------------------------------------------------------------------
CREATE TABLE alerts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type  alert_type NOT NULL,
    severity    alert_severity NOT NULL,
    status      alert_status NOT NULL DEFAULT 'ACTIVE',
    zone_id     UUID REFERENCES zones(id) ON DELETE SET NULL,
    event_id    UUID REFERENCES events(id) ON DELETE SET NULL,
    title       TEXT NOT NULL,
    description TEXT,
    evidence    JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES stakeholders(id) ON DELETE SET NULL
);

COMMENT ON TABLE alerts IS 'Real-time alerts triggered by density thresholds, conflict detection, anomalies, etc.';

CREATE INDEX idx_alerts_type     ON alerts (alert_type);
CREATE INDEX idx_alerts_severity ON alerts (severity);
CREATE INDEX idx_alerts_status   ON alerts (status);
CREATE INDEX idx_alerts_zone_id  ON alerts (zone_id);
CREATE INDEX idx_alerts_event_id ON alerts (event_id);
CREATE INDEX idx_alerts_evidence ON alerts USING GIN (evidence);
CREATE INDEX idx_alerts_created  ON alerts (created_at DESC);

-- ---------------------------------------------------------------------------
-- Recommendations — suggested actions for active alerts
-- ---------------------------------------------------------------------------
CREATE TABLE recommendations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id       UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    action_text    TEXT NOT NULL,
    priority       INT NOT NULL DEFAULT 1 CHECK (priority >= 1 AND priority <= 10),
    estimated_cost NUMERIC(12, 2),
    status         TEXT NOT NULL DEFAULT 'proposed',      -- proposed, accepted, rejected, implemented
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE recommendations IS 'Decision-support actions tied to alerts.';

CREATE INDEX idx_recommendations_alert_id ON recommendations (alert_id);
CREATE INDEX idx_recommendations_status   ON recommendations (status);

CREATE TRIGGER set_recommendations_updated_at
    BEFORE UPDATE ON recommendations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
