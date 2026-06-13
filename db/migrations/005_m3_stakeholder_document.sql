-- ============================================================================
-- 005_m3_stakeholder_document.sql — Module 3: Stakeholder & Document
-- People / orgs who produce risk documents, and the documents themselves.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Stakeholders
-- ---------------------------------------------------------------------------
CREATE TABLE stakeholders (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    role         stakeholder_role NOT NULL,
    organization TEXT,
    email        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE stakeholders IS 'Individuals or teams involved in event risk management.';

CREATE INDEX idx_stakeholders_role ON stakeholders (role);

CREATE TRIGGER set_stakeholders_updated_at
    BEFORE UPDATE ON stakeholders
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
CREATE TABLE documents (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title          TEXT NOT NULL,
    doc_type       document_type NOT NULL,
    version        TEXT DEFAULT '1.0',
    upload_date    TIMESTAMPTZ NOT NULL DEFAULT now(),
    stakeholder_id UUID REFERENCES stakeholders(id) ON DELETE SET NULL,
    file_path      TEXT,
    file_hash      TEXT,                                  -- SHA-256 of uploaded file
    metadata       JSONB DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  documents IS 'Risk and safety documents uploaded by stakeholders.';
COMMENT ON COLUMN documents.file_hash IS 'SHA-256 hash for integrity verification and deduplication.';

CREATE INDEX idx_documents_doc_type       ON documents (doc_type);
CREATE INDEX idx_documents_stakeholder_id ON documents (stakeholder_id);
CREATE INDEX idx_documents_metadata       ON documents USING GIN (metadata);

CREATE TRIGGER set_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- Now add the deferred FK constraints from risk_assessments (migration 004)
-- ---------------------------------------------------------------------------
ALTER TABLE risk_assessments
    ADD CONSTRAINT fk_risk_assessments_stakeholder
    FOREIGN KEY (stakeholder_id) REFERENCES stakeholders(id) ON DELETE SET NULL;

ALTER TABLE risk_assessments
    ADD CONSTRAINT fk_risk_assessments_document
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;
