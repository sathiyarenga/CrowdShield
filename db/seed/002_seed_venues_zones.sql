-- ============================================================================
-- 002_seed_venues_zones.sql — Seed demo venues and zones
-- Uses WKT polygons for Amsterdam event locations.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Johan Cruijff ArenA (Amsterdam)
-- ---------------------------------------------------------------------------
INSERT INTO venues (id, name, geometry, total_capacity, venue_type) VALUES
    ('b0000000-0000-0000-0000-000000000001',
     'Johan Cruijff ArenA',
     ST_GeogFromText('POLYGON((4.9398 52.3142, 4.9425 52.3142, 4.9425 52.3155, 4.9398 52.3155, 4.9398 52.3142))'),
     55000,
     'stadium')
ON CONFLICT (id) DO NOTHING;

INSERT INTO zones (id, venue_id, name, geometry, capacity, zone_type) VALUES
    ('c0000000-0000-0000-0000-000000000001',
     'b0000000-0000-0000-0000-000000000001',
     'North Stand',
     ST_GeogFromText('POLYGON((4.9400 52.3150, 4.9412 52.3150, 4.9412 52.3155, 4.9400 52.3155, 4.9400 52.3150))'),
     14000, 'stand'),
    ('c0000000-0000-0000-0000-000000000002',
     'b0000000-0000-0000-0000-000000000001',
     'South Stand',
     ST_GeogFromText('POLYGON((4.9400 52.3142, 4.9412 52.3142, 4.9412 52.3147, 4.9400 52.3147, 4.9400 52.3142))'),
     14000, 'stand'),
    ('c0000000-0000-0000-0000-000000000003',
     'b0000000-0000-0000-0000-000000000001',
     'Main Concourse',
     ST_GeogFromText('POLYGON((4.9398 52.3142, 4.9425 52.3142, 4.9425 52.3143, 4.9398 52.3143, 4.9398 52.3142))'),
     5000, 'concourse'),
    ('c0000000-0000-0000-0000-000000000004',
     'b0000000-0000-0000-0000-000000000001',
     'Gate A - West Entrance',
     ST_GeogFromText('POINT(4.9398 52.3148)'),
     2000, 'gate'),
    ('c0000000-0000-0000-0000-000000000005',
     'b0000000-0000-0000-0000-000000000001',
     'Gate B - East Entrance',
     ST_GeogFromText('POINT(4.9425 52.3148)'),
     2000, 'gate')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Museumplein (Amsterdam) — open-air venue
-- ---------------------------------------------------------------------------
INSERT INTO venues (id, name, geometry, total_capacity, venue_type) VALUES
    ('b0000000-0000-0000-0000-000000000002',
     'Museumplein Amsterdam',
     ST_GeogFromText('POLYGON((4.8780 52.3570, 4.8840 52.3570, 4.8840 52.3590, 4.8780 52.3590, 4.8780 52.3570))'),
     40000,
     'park')
ON CONFLICT (id) DO NOTHING;

INSERT INTO zones (id, venue_id, name, geometry, capacity, zone_type) VALUES
    ('c0000000-0000-0000-0000-000000000006',
     'b0000000-0000-0000-0000-000000000002',
     'Main Stage Area',
     ST_GeogFromText('POLYGON((4.8790 52.3575, 4.8820 52.3575, 4.8820 52.3585, 4.8790 52.3585, 4.8790 52.3575))'),
     20000, 'stage'),
    ('c0000000-0000-0000-0000-000000000007',
     'b0000000-0000-0000-0000-000000000002',
     'Food Court',
     ST_GeogFromText('POLYGON((4.8825 52.3575, 4.8835 52.3575, 4.8835 52.3580, 4.8825 52.3580, 4.8825 52.3575))'),
     5000, 'amenity'),
    ('c0000000-0000-0000-0000-000000000008',
     'b0000000-0000-0000-0000-000000000002',
     'North Entrance',
     ST_GeogFromText('POINT(4.8810 52.3590)'),
     3000, 'gate')
ON CONFLICT (id) DO NOTHING;
