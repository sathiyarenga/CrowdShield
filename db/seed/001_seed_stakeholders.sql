-- ============================================================================
-- 001_seed_stakeholders.sql — Seed initial stakeholders
-- ============================================================================

INSERT INTO stakeholders (id, name, role, organization, email) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'Dr. Anna de Vries',     'RISK_CONSULTANT',    'CrowdShield BV',          'anna.devries@crowdshield.io'),
    ('a0000000-0000-0000-0000-000000000002', 'Mark Jansen',           'EVENT_ORGANISER',    'LiveNation NL',            'mark.jansen@livenation.nl'),
    ('a0000000-0000-0000-0000-000000000003', 'Gemeente Amsterdam',    'MUNICIPALITY',       'City of Amsterdam',        'evenementen@amsterdam.nl'),
    ('a0000000-0000-0000-0000-000000000004', 'Politie Amsterdam',     'POLICE',             'Nationale Politie',        'evenementen@politie.nl'),
    ('a0000000-0000-0000-0000-000000000005', 'Brandweer Amsterdam',   'FIRE_SERVICE',       'Brandweer Amsterdam',      'planning@brandweer.amsterdam.nl'),
    ('a0000000-0000-0000-0000-000000000006', 'GHOR Amsterdam',        'AMBULANCE_EMS',      'GGD Amsterdam',            'ghor@ggd.amsterdam.nl'),
    ('a0000000-0000-0000-0000-000000000007', 'Sarah Bakker',          'VENUE_OPERATOR',     'Johan Cruijff ArenA',      'sarah.bakker@johancruijffarena.nl'),
    ('a0000000-0000-0000-0000-000000000008', 'Aegon Event Insurance', 'INSURANCE',          'Aegon NV',                 'events@aegon.nl'),
    ('a0000000-0000-0000-0000-000000000009', 'GVB Liaison',           'TRANSPORT_AUTHORITY', 'GVB Amsterdam',           'evenementen@gvb.nl'),
    ('a0000000-0000-0000-0000-00000000000a', 'Tom de Groot',          'CROWD_MANAGER',      'CrowdShield BV',           'tom.degroot@crowdshield.io')
ON CONFLICT (id) DO NOTHING;
