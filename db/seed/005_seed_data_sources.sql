-- ============================================================================
-- 005_seed_data_sources.sql — Seed data source configurations
-- ============================================================================

INSERT INTO data_sources (id, name, source_type, config, is_active) VALUES
    ('10000000-0000-0000-0000-000000000001',
     'Vodafone Mobility Analytics',
     'TELECOM_MOBILITY',
     '{"provider": "Vodafone", "api_version": "v3", "resolution_minutes": 5, "coverage": "nationwide"}'::jsonb,
     true),
    ('10000000-0000-0000-0000-000000000002',
     'ArenA CCTV CV System',
     'CAMERA_CV',
     '{"vendor": "Axis", "model": "P3245-V", "cameras": 48, "fps": 15, "detection_model": "YOLOv8"}'::jsonb,
     true),
    ('10000000-0000-0000-0000-000000000003',
     'KNMI Weather Feed',
     'WEATHER_API',
     '{"provider": "KNMI", "station": "240", "metrics": ["temperature", "wind_speed", "precipitation"]}'::jsonb,
     true),
    ('10000000-0000-0000-0000-000000000004',
     'Ticketmaster Scan Feed',
     'TICKET_SCAN',
     '{"provider": "Ticketmaster", "format": "barcode_128", "scan_points": ["Gate A", "Gate B"]}'::jsonb,
     true),
    ('10000000-0000-0000-0000-000000000005',
     'Museumplein WiFi Probes',
     'WIFI_PROBE',
     '{"vendor": "Cisco Meraki", "access_points": 12, "mac_randomization_aware": true}'::jsonb,
     true),
    ('10000000-0000-0000-0000-000000000006',
     'Manual Headcount Team',
     'MANUAL_COUNT',
     '{"team_size": 8, "interval_minutes": 15}'::jsonb,
     true)
ON CONFLICT (id) DO NOTHING;
