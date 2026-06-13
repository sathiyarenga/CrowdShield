-- ============================================================================
-- 004_m2_hazard_risk.sql — Module 2: Hazard & Risk
-- Hazard identification and scored risk assessments with GENERATED risk_score.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Hazards — identified hazard scenarios linked to zones
-- ---------------------------------------------------------------------------
CREATE TABLE hazards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name  TEXT NOT NULL,
    category        hazard_category NOT NULL,
    description     TEXT,
    zone_id         UUID REFERENCES zones(id) ON DELETE SET NULL,
    temporal_window TSTZRANGE,                          -- when the hazard is active
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  hazards IS 'Identified hazard scenarios (BFO: Disposition) scoped to zones and time windows.';
COMMENT ON COLUMN hazards.temporal_window IS 'Time range during which this hazard is considered active (e.g., during ingress only).';

CREATE INDEX idx_hazards_category ON hazards (category);
CREATE INDEX idx_hazards_zone_id  ON hazards (zone_id);
-- GiST index on temporal range for overlap queries
CREATE INDEX idx_hazards_temporal ON hazards USING GIST (temporal_window);

CREATE TRIGGER set_hazards_updated_at
    BEFORE UPDATE ON hazards
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- Risk Assessments — stakeholder evaluations of hazards
-- ---------------------------------------------------------------------------
-- Likelihood × consequence mapping to integer for GENERATED risk_score:
--   RARE=1 … ALMOST_CERTAIN=5  ×  NEGLIGIBLE=1 … CATASTROPHIC=5
-- risk_score is the product (1–25) stored as a GENERATED column.

CREATE OR REPLACE FUNCTION likelihood_to_int(l likelihood_level) RETURNS INT
    IMMUTABLE LANGUAGE sql AS $$
    SELECT CASE l
        WHEN 'RARE'            THEN 1
        WHEN 'UNLIKELY'        THEN 2
        WHEN 'POSSIBLE'        THEN 3
        WHEN 'LIKELY'          THEN 4
        WHEN 'ALMOST_CERTAIN'  THEN 5
    END;
$$;

CREATE OR REPLACE FUNCTION consequence_to_int(c consequence_level) RETURNS INT
    IMMUTABLE LANGUAGE sql AS $$
    SELECT CASE c
        WHEN 'NEGLIGIBLE'  THEN 1
        WHEN 'MINOR'       THEN 2
        WHEN 'MODERATE'    THEN 3
        WHEN 'MAJOR'       THEN 4
        WHEN 'CATASTROPHIC' THEN 5
    END;
$$;

CREATE TABLE risk_assessments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hazard_id       UUID NOT NULL REFERENCES hazards(id) ON DELETE CASCADE,
    stakeholder_id  UUID,  -- FK added after stakeholders table is created (migration 005)
    document_id     UUID,  -- FK added after documents table is created (migration 005)
    source_page     INT,
    source_text     TEXT,
    likelihood      likelihood_level NOT NULL,
    consequence     consequence_level NOT NULL,
    risk_score      INT GENERATED ALWAYS AS (
                        likelihood_to_int(likelihood) * consequence_to_int(consequence)
                    ) STORED,
    controls        JSONB DEFAULT '[]'::jsonb,           -- array of mitigation controls
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  risk_assessments IS 'Stakeholder-authored risk evaluations with auto-computed risk score (likelihood × consequence).';
COMMENT ON COLUMN risk_assessments.risk_score IS 'Auto-computed: likelihood_int(1-5) × consequence_int(1-5). Range 1-25.';
COMMENT ON COLUMN risk_assessments.controls IS 'JSONB array of mitigation/control measures, e.g. [{"name":"Barriers","type":"engineering"}].';

CREATE INDEX idx_risk_assessments_hazard      ON risk_assessments (hazard_id);
CREATE INDEX idx_risk_assessments_stakeholder ON risk_assessments (stakeholder_id);
CREATE INDEX idx_risk_assessments_document    ON risk_assessments (document_id);
CREATE INDEX idx_risk_assessments_controls    ON risk_assessments USING GIN (controls);

CREATE TRIGGER set_risk_assessments_updated_at
    BEFORE UPDATE ON risk_assessments
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
