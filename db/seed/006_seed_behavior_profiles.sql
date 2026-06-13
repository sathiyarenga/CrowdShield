-- ============================================================================
-- 006_seed_behavior_profiles.sql — Seed crowd behavior archetypes
-- ============================================================================

INSERT INTO behavior_profiles (id, name, walking_speed, reaction_time, familiarity_level, group_size, herding_coefficient, description) VALUES
    ('20000000-0000-0000-0000-000000000001',
     'Regular Commuter',
     1.4, 0.8, 0.9, 1, 0.2,
     'Frequent visitor familiar with venue layout. Fast, independent movement.'),
    ('20000000-0000-0000-0000-000000000002',
     'Family Group',
     0.9, 1.5, 0.5, 4, 0.6,
     'Family with children. Slower pace, higher reaction time, moderate herding.'),
    ('20000000-0000-0000-0000-000000000003',
     'Young Concert-Goer',
     1.2, 0.6, 0.3, 3, 0.8,
     'First-time visitor, high herding tendency. Moves with peer group.'),
    ('20000000-0000-0000-0000-000000000004',
     'Elderly Visitor',
     0.7, 2.0, 0.6, 2, 0.4,
     'Reduced mobility, longer reaction time, moderate familiarity.'),
    ('20000000-0000-0000-0000-000000000005',
     'VIP / Hospitality Guest',
     1.1, 1.0, 0.7, 2, 0.3,
     'Guided experience with dedicated routes. Low herding.'),
    ('20000000-0000-0000-0000-000000000006',
     'Away Fan (Derby)',
     1.3, 0.5, 0.2, 6, 0.9,
     'Unfamiliar with venue, very high herding, travels in large group.')
ON CONFLICT (id) DO NOTHING;
