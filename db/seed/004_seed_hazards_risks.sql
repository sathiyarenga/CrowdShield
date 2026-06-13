-- ============================================================================
-- 004_seed_hazards_risks.sql — Seed demo hazards and risk assessments
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Hazards for the Ajax match at Johan Cruijff ArenA
-- ---------------------------------------------------------------------------
INSERT INTO hazards (id, canonical_name, category, description, zone_id, temporal_window) VALUES
    ('e0000000-0000-0000-0000-000000000001',
     'Gate A Crush Risk',
     'CROWD_CRUSH',
     'High density risk at Gate A during pre-match ingress when both home and away fans converge.',
     'c0000000-0000-0000-0000-000000000004',
     '[2026-09-15 16:30:00+02, 2026-09-15 18:30:00+02]'),
    ('e0000000-0000-0000-0000-000000000002',
     'Post-Match Crowd Surge',
     'CROWD_SURGE',
     'Sudden crowd movement at final whistle, especially if result is contentious.',
     'c0000000-0000-0000-0000-000000000003',
     '[2026-09-15 20:15:00+02, 2026-09-15 21:30:00+02]'),
    ('e0000000-0000-0000-0000-000000000003',
     'Public Order - Derby Tensions',
     'PUBLIC_ORDER',
     'Potential for fan violence during high-rivalry Eredivisie derby.',
     NULL,
     '[2026-09-15 14:00:00+02, 2026-09-15 23:00:00+02]'),
    ('e0000000-0000-0000-0000-000000000004',
     'Severe Weather Alert',
     'WEATHER_EXTREME',
     'September thunderstorm risk for open-air concourse areas.',
     'c0000000-0000-0000-0000-000000000003',
     NULL),
    ('e0000000-0000-0000-0000-000000000005',
     'Metro Station Overload',
     'TRANSPORT_DISRUPTION',
     'Bijlmer ArenA metro station capacity exceeded during egress.',
     NULL,
     '[2026-09-15 20:00:00+02, 2026-09-15 22:30:00+02]')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Hazards for Museumplein Summer Concert
-- ---------------------------------------------------------------------------
INSERT INTO hazards (id, canonical_name, category, description, zone_id, temporal_window) VALUES
    ('e0000000-0000-0000-0000-000000000006',
     'Main Stage Density',
     'CROWD_CRUSH',
     'Dense packing near stage barrier during headliner performance.',
     'c0000000-0000-0000-0000-000000000006',
     '[2026-07-20 20:00:00+02, 2026-07-20 22:00:00+02]'),
    ('e0000000-0000-0000-0000-000000000007',
     'Medical Mass Casualty - Heat',
     'MEDICAL_MASS_CASUALTY',
     'July heat risk: dehydration and heat exhaustion among crowd.',
     NULL,
     '[2026-07-20 12:00:00+02, 2026-07-20 18:00:00+02]')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Risk Assessments — multiple stakeholders assessing the same hazards
-- ---------------------------------------------------------------------------
INSERT INTO risk_assessments (id, hazard_id, stakeholder_id, likelihood, consequence, controls) VALUES
    -- Gate A Crush: Risk consultant says LIKELY / MAJOR
    ('f0000000-0000-0000-0000-000000000001',
     'e0000000-0000-0000-0000-000000000001',
     'a0000000-0000-0000-0000-000000000001',
     'LIKELY', 'MAJOR',
     '[{"name": "Queue management barriers", "type": "engineering"},
       {"name": "Real-time density monitoring", "type": "technology"},
       {"name": "Staggered entry times", "type": "administrative"}]'::jsonb),
    -- Gate A Crush: Event organiser says POSSIBLE / MODERATE (divergent!)
    ('f0000000-0000-0000-0000-000000000002',
     'e0000000-0000-0000-0000-000000000001',
     'a0000000-0000-0000-0000-000000000002',
     'POSSIBLE', 'MODERATE',
     '[{"name": "Steward deployment", "type": "administrative"}]'::jsonb),
    -- Post-match surge: Police says ALMOST_CERTAIN / MAJOR
    ('f0000000-0000-0000-0000-000000000003',
     'e0000000-0000-0000-0000-000000000002',
     'a0000000-0000-0000-0000-000000000004',
     'ALMOST_CERTAIN', 'MAJOR',
     '[{"name": "Phased exit strategy", "type": "administrative"},
       {"name": "Mounted police presence", "type": "security"}]'::jsonb),
    -- Derby tensions: Police says LIKELY / CATASTROPHIC
    ('f0000000-0000-0000-0000-000000000004',
     'e0000000-0000-0000-0000-000000000003',
     'a0000000-0000-0000-0000-000000000004',
     'LIKELY', 'CATASTROPHIC',
     '[{"name": "Fan segregation", "type": "security"},
       {"name": "Alcohol restrictions", "type": "administrative"},
       {"name": "CCTV monitoring", "type": "technology"}]'::jsonb),
    -- Main stage density: Crowd manager says POSSIBLE / MAJOR
    ('f0000000-0000-0000-0000-000000000005',
     'e0000000-0000-0000-0000-000000000006',
     'a0000000-0000-0000-0000-00000000000a',
     'POSSIBLE', 'MAJOR',
     '[{"name": "Crowd density sensors", "type": "technology"},
       {"name": "Break-out lanes", "type": "engineering"}]'::jsonb)
ON CONFLICT (id) DO NOTHING;
