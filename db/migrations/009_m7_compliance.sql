-- ============================================================================
-- 009_m7_compliance.sql — Module 7: Compliance & Regulation
-- Regulatory requirements and event-level compliance checks.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Regulations — legal/standard requirements
-- ---------------------------------------------------------------------------
CREATE TABLE regulations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    jurisdiction  TEXT NOT NULL,                          -- e.g. NL, UK, EU, US-CA
    standard_ref  TEXT,                                   -- e.g. ISO 31000, NEN 8020
    description   TEXT,
    requirements  JSONB DEFAULT '[]'::jsonb,              -- structured requirement items
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  regulations IS 'Regulatory standards and legal requirements for crowd safety.';
COMMENT ON COLUMN regulations.requirements IS 'JSONB array of requirement objects, e.g. [{"ref":"4.2.1","text":"Max density 4 p/m²"}].';

CREATE INDEX idx_regulations_jurisdiction ON regulations (jurisdiction);
CREATE INDEX idx_regulations_requirements ON regulations USING GIN (requirements);

CREATE TRIGGER set_regulations_updated_at
    BEFORE UPDATE ON regulations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- Compliance Checks — audit results per event × regulation × zone
-- ---------------------------------------------------------------------------
CREATE TABLE compliance_checks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    regulation_id UUID NOT NULL REFERENCES regulations(id) ON DELETE CASCADE,
    zone_id       UUID REFERENCES zones(id) ON DELETE SET NULL,
    status        TEXT NOT NULL DEFAULT 'pending',        -- pending, compliant, non_compliant, partial
    findings      JSONB DEFAULT '[]'::jsonb,
    checked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE compliance_checks IS 'Audit results linking events to regulatory requirements.';

CREATE INDEX idx_compliance_event_id      ON compliance_checks (event_id);
CREATE INDEX idx_compliance_regulation_id ON compliance_checks (regulation_id);
CREATE INDEX idx_compliance_zone_id       ON compliance_checks (zone_id);
CREATE INDEX idx_compliance_status        ON compliance_checks (status);
CREATE INDEX idx_compliance_findings      ON compliance_checks USING GIN (findings);

CREATE TRIGGER set_compliance_checks_updated_at
    BEFORE UPDATE ON compliance_checks
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
