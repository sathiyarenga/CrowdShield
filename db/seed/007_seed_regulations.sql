-- ============================================================================
-- 007_seed_regulations.sql — Seed regulatory standards
-- ============================================================================

INSERT INTO regulations (id, name, jurisdiction, standard_ref, description, requirements) VALUES
    ('30000000-0000-0000-0000-000000000001',
     'NEN 8020 Crowd Management',
     'NL',
     'NEN 8020-1:2015',
     'Dutch standard for crowd management at events. Covers risk assessment, crowd density limits, and evacuation planning.',
     '[
        {"ref": "4.1", "text": "Maximum crowd density shall not exceed 4 persons/m² in standing areas"},
        {"ref": "4.2", "text": "Emergency evacuation must be achievable within 8 minutes for any zone"},
        {"ref": "5.1", "text": "Real-time crowd monitoring required for events >10,000 attendees"},
        {"ref": "6.3", "text": "Multi-stakeholder risk assessment mandatory before event permit"}
      ]'::jsonb),
    ('30000000-0000-0000-0000-000000000002',
     'Guide to Safety at Sports Grounds (Green Guide)',
     'UK',
     'SGSA 6th Edition',
     'UK guidance on safety at sports grounds covering structural, fire, and crowd safety.',
     '[
        {"ref": "2.4", "text": "P-factor calculation required for all viewing areas"},
        {"ref": "3.1", "text": "Exit widths must support 660 persons per meter per minute"},
        {"ref": "5.2", "text": "CCTV coverage required for all public areas"},
        {"ref": "7.1", "text": "Safety certificate must specify maximum safe capacity"}
      ]'::jsonb),
    ('30000000-0000-0000-0000-000000000003',
     'ISO 31000 Risk Management',
     'INT',
     'ISO 31000:2018',
     'International standard for risk management principles and framework.',
     '[
        {"ref": "5.4.2", "text": "Risk identification shall be systematic, structured, and timely"},
        {"ref": "5.4.3", "text": "Risk analysis shall consider likelihood and consequences"},
        {"ref": "5.4.4", "text": "Risk evaluation shall support decision-making"},
        {"ref": "5.5",   "text": "Risk treatment options shall be selected and implemented"}
      ]'::jsonb),
    ('30000000-0000-0000-0000-000000000004',
     'Besluit Brandveilig Gebruik',
     'NL',
     'BBG 2024',
     'Dutch decree on fire-safe use of buildings and venues.',
     '[
        {"ref": "2.1", "text": "Maximum occupancy based on fire compartment calculations"},
        {"ref": "3.5", "text": "Emergency lighting on all escape routes"},
        {"ref": "4.2", "text": "Fire detection system with direct alarm centre connection"}
      ]'::jsonb)
ON CONFLICT (id) DO NOTHING;
