-- ============================================================================
-- 011_views_conflict_gap.sql — Conflict & Gap Detection Views
-- Analytical views for identifying risk assessment divergences and coverage gaps.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- VIEW: risk_conflicts
-- Finds cases where two different stakeholders assessed the SAME hazard but
-- arrived at significantly different risk scores (divergence > 0).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW risk_conflicts AS
SELECT
    ra1.hazard_id,
    h.canonical_name           AS hazard_name,
    h.category                 AS hazard_category,
    ra1.id                     AS assessment_1_id,
    s1.name                    AS stakeholder_1_name,
    s1.role                    AS stakeholder_1_role,
    ra1.likelihood             AS likelihood_1,
    ra1.consequence            AS consequence_1,
    ra1.risk_score             AS score_1,
    ra2.id                     AS assessment_2_id,
    s2.name                    AS stakeholder_2_name,
    s2.role                    AS stakeholder_2_role,
    ra2.likelihood             AS likelihood_2,
    ra2.consequence            AS consequence_2,
    ra2.risk_score             AS score_2,
    ABS(ra1.risk_score - ra2.risk_score) AS score_divergence
FROM risk_assessments ra1
JOIN risk_assessments ra2
    ON ra1.hazard_id = ra2.hazard_id
    AND ra1.stakeholder_id < ra2.stakeholder_id          -- avoid self-join duplicates
JOIN hazards h    ON h.id  = ra1.hazard_id
JOIN stakeholders s1 ON s1.id = ra1.stakeholder_id
JOIN stakeholders s2 ON s2.id = ra2.stakeholder_id
WHERE ra1.stakeholder_id IS NOT NULL
  AND ra2.stakeholder_id IS NOT NULL
ORDER BY score_divergence DESC;

COMMENT ON VIEW risk_conflicts IS
    'Pairs of risk assessments on the same hazard from different stakeholders, '
    'ranked by score divergence to surface disagreements.';

-- ---------------------------------------------------------------------------
-- VIEW: risk_gaps
-- Cross-joins stakeholders × hazard categories, then LEFT JOINs existing
-- assessments to find (stakeholder, category) pairs with NO assessment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW risk_gaps AS
SELECT
    s.id            AS stakeholder_id,
    s.name          AS stakeholder_name,
    s.role          AS stakeholder_role,
    hc.category     AS hazard_category,
    COUNT(ra.id)    AS assessment_count
FROM stakeholders s
CROSS JOIN (
    -- Unnest the hazard_category enum to get all possible categories
    SELECT unnest(enum_range(NULL::hazard_category)) AS category
) hc
LEFT JOIN hazards h
    ON h.category = hc.category
LEFT JOIN risk_assessments ra
    ON ra.hazard_id = h.id
    AND ra.stakeholder_id = s.id
GROUP BY s.id, s.name, s.role, hc.category
HAVING COUNT(ra.id) = 0
ORDER BY s.name, hc.category;

COMMENT ON VIEW risk_gaps IS
    'Identifies (stakeholder, hazard_category) pairs where no risk assessment exists, '
    'highlighting blind spots in coverage.';
