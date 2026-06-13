-- ============================================================================
-- 008_seed_benchmarks.sql — Seed crowd benchmarks and anomaly baselines
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Crowd Benchmarks — industry reference values by event type
-- ---------------------------------------------------------------------------
INSERT INTO crowd_benchmarks (id, event_type, metric, value, confidence, comparable_events, description) VALUES
    ('40000000-0000-0000-0000-000000000001', 'sports',  'peak_density_ppm2',     3.2,  0.85, 120, 'Typical peak density in standing areas for football matches'),
    ('40000000-0000-0000-0000-000000000002', 'sports',  'ingress_duration_min',   90.0, 0.90, 120, 'Average ingress duration from gates open to kick-off'),
    ('40000000-0000-0000-0000-000000000003', 'sports',  'egress_duration_min',    45.0, 0.88, 120, 'Average full-venue egress after final whistle'),
    ('40000000-0000-0000-0000-000000000004', 'concert', 'peak_density_ppm2',      4.5,  0.75,  65, 'Peak density near stage barrier during headliner'),
    ('40000000-0000-0000-0000-000000000005', 'concert', 'medical_rate_per_1000',   2.1,  0.80,  65, 'Medical incidents per 1000 attendees (outdoor summer concerts)'),
    ('40000000-0000-0000-0000-000000000006', 'festival','peak_density_ppm2',       2.8,  0.70,  40, 'Peak density across all zones during multi-stage festival'),
    ('40000000-0000-0000-0000-000000000007', 'festival','dwell_time_avg_min',     240.0, 0.72,  40, 'Average visitor dwell time at multi-day festival'),
    ('40000000-0000-0000-0000-000000000008', 'sports',  'flow_rate_ppm_gate',     66.0, 0.92, 120, 'Persons per meter per minute through entry gates (Green Guide benchmark)')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Anomaly Baselines — for Gate A zone at Johan Cruijff ArenA
-- On event days, by hour of day
-- ---------------------------------------------------------------------------
INSERT INTO anomaly_baselines (id, zone_id, hour_of_day, day_type, expected_value, std_dev, threshold_sigma) VALUES
    ('50000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004', 14, 'event_day',   50.0,  15.0, 2.0),
    ('50000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000004', 15, 'event_day',  200.0,  60.0, 2.0),
    ('50000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000004', 16, 'event_day',  800.0, 150.0, 2.0),
    ('50000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004', 17, 'event_day', 1500.0, 200.0, 2.0),
    ('50000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', 18, 'event_day', 1800.0, 180.0, 1.5),
    ('50000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000004', 19, 'event_day',  100.0,  40.0, 2.0),
    ('50000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000004', 20, 'event_day',   80.0,  30.0, 2.0),
    ('50000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000004', 21, 'event_day',  400.0, 120.0, 2.0),
    ('50000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000004', 22, 'event_day',  200.0,  80.0, 2.0)
ON CONFLICT (id) DO NOTHING;
