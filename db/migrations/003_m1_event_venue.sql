-- ============================================================================
-- 003_m1_event_venue.sql — Module 1: Event & Venue
-- Core spatial entities: venues, zones (with PostGIS GEOGRAPHY), and events.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Venues — physical locations with polygon boundaries
-- ---------------------------------------------------------------------------
CREATE TABLE venues (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    geometry        GEOGRAPHY(Geometry, 4326),          -- WKT polygon/multipolygon
    total_capacity  INT CHECK (total_capacity > 0),
    venue_type      TEXT NOT NULL DEFAULT 'general',     -- e.g. stadium, arena, park, street
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  venues IS 'Physical venue locations with PostGIS geography boundaries.';
COMMENT ON COLUMN venues.geometry IS 'Venue boundary as GEOGRAPHY (SRID 4326). Use ST_GeomFromText(wkt, 4326)::geography to insert.';

-- Spatial index on venue geometry
CREATE INDEX idx_venues_geometry ON venues USING GIST (geometry);

-- ---------------------------------------------------------------------------
-- Zones — sub-areas within a venue (gates, stages, concourses, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE zones (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id    UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    geometry    GEOGRAPHY(Geometry, 4326),
    capacity    INT CHECK (capacity > 0),
    zone_type   TEXT NOT NULL DEFAULT 'general',         -- e.g. gate, stage, concourse, vip
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  zones IS 'Sub-areas within a venue (gates, stages, concourses).';

CREATE INDEX idx_zones_venue_id ON zones (venue_id);
CREATE INDEX idx_zones_geometry ON zones USING GIST (geometry);

-- ---------------------------------------------------------------------------
-- Events — scheduled gatherings at a venue
-- ---------------------------------------------------------------------------
CREATE TABLE events (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 TEXT NOT NULL,
    event_type           TEXT NOT NULL DEFAULT 'general', -- e.g. concert, festival, sports, protest
    date_start           TIMESTAMPTZ NOT NULL,
    date_end             TIMESTAMPTZ NOT NULL,
    expected_attendance  INT CHECK (expected_attendance >= 0),
    status               TEXT NOT NULL DEFAULT 'planned', -- planned, active, completed, cancelled
    venue_id             UUID NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_event_dates CHECK (date_end >= date_start)
);

COMMENT ON TABLE events IS 'Scheduled events with temporal bounds and expected attendance.';

CREATE INDEX idx_events_venue_id   ON events (venue_id);
CREATE INDEX idx_events_date_start ON events (date_start);
CREATE INDEX idx_events_status     ON events (status);

-- ---------------------------------------------------------------------------
-- Auto-update updated_at trigger (reused across modules)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_venues_updated_at
    BEFORE UPDATE ON venues
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_zones_updated_at
    BEFORE UPDATE ON zones
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_events_updated_at
    BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
