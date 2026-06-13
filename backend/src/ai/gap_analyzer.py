"""Gap analysis — compare extracted risks against the 8 canonical hazard categories.

Identifies coverage gaps, scores document completeness, and generates
actionable recommendations for each under-covered category.
"""

from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass, field

from src.ai.risk_extractor import HAZARD_CATEGORIES, ExtractedRisk

logger = logging.getLogger(__name__)

# ═════════════════════════════════════════════════════════════════════════════
# Minimum coverage thresholds and category metadata
# ═════════════════════════════════════════════════════════════════════════════

_CATEGORY_META: dict[str, dict] = {
    "crowd_crush": {
        "display_name": "Crowd Crush / Crowd Management",
        "description": "Risks relating to overcrowding, crush incidents, crowd density, ingress/egress flow, and capacity management.",
        "min_expected_risks": 3,
        "weight": 1.0,  # importance weight for scoring
        "recommendations_if_missing": [
            "Add crowd density analysis for all gathering areas",
            "Define maximum capacity per zone with crowd counting methodology",
            "Document ingress/egress flow modelling and bottleneck analysis",
            "Include crowd management staffing ratios and deployment plan",
            "Specify trigger points for crowd management interventions",
        ],
    },
    "fire": {
        "display_name": "Fire Safety",
        "description": "Risks relating to fire, pyrotechnics, combustible materials, and fire response.",
        "min_expected_risks": 2,
        "weight": 0.9,
        "recommendations_if_missing": [
            "Include fire risk assessment for all temporary structures",
            "Document fire marshal deployment and fire equipment locations",
            "Specify pyrotechnics and special effects safety protocols",
            "Define fire evacuation routes distinct from general egress",
        ],
    },
    "weather": {
        "display_name": "Weather & Environmental Conditions",
        "description": "Risks from adverse weather: wind, rain, storms, lightning, temperature extremes.",
        "min_expected_risks": 2,
        "weight": 0.8,
        "recommendations_if_missing": [
            "Document weather monitoring protocol and data sources",
            "Define wind speed thresholds for temporary structures and activities",
            "Include rain contingency plan and wet-weather crowd safety measures",
            "Specify lightning protocol with timing for clearing outdoor areas",
        ],
    },
    "security": {
        "display_name": "Security & Public Order",
        "description": "Risks relating to security threats, terrorism, anti-social behaviour, and public order.",
        "min_expected_risks": 2,
        "weight": 0.9,
        "recommendations_if_missing": [
            "Include counter-terrorism vulnerability assessment (CT-SA/HVM)",
            "Document security staffing plan with SIA-accredited personnel",
            "Define hostile vehicle mitigation (HVM) measures",
            "Include protocols for managing intoxicated or aggressive attendees",
            "Specify bag search and prohibited items policy",
        ],
    },
    "medical": {
        "display_name": "Medical & First Aid",
        "description": "Risks requiring medical response: injuries, illness, cardiac events, mass casualty.",
        "min_expected_risks": 2,
        "weight": 0.9,
        "recommendations_if_missing": [
            "Include medical needs assessment based on attendance profile",
            "Document first aid provision with staffing ratios per 1000 attendees",
            "Define ambulance access routes and nearest hospital details",
            "Include mass casualty plan with triage procedures",
            "Specify location and coverage of AED/defibrillator units",
        ],
    },
    "infrastructure": {
        "display_name": "Infrastructure & Structures",
        "description": "Risks from temporary structures, staging, barriers, electrical systems, and ground conditions.",
        "min_expected_risks": 2,
        "weight": 0.7,
        "recommendations_if_missing": [
            "Include structural integrity certification for all temporary structures",
            "Document electrical safety including generator specs and cable runs",
            "Assess ground conditions and trip/fall hazards",
            "Specify barrier and fencing deployment plan with load ratings",
        ],
    },
    "traffic": {
        "display_name": "Traffic & Transport",
        "description": "Risks from vehicle movements, road closures, parking, and transport logistics.",
        "min_expected_risks": 2,
        "weight": 0.7,
        "recommendations_if_missing": [
            "Include full traffic management plan with road closure schedule",
            "Document pedestrian-vehicle segregation measures",
            "Specify parking plan and drop-off/pick-up arrangements",
            "Include public transport coordination details",
        ],
    },
    "environmental": {
        "display_name": "Environmental & Water Safety",
        "description": "Risks from water bodies, noise pollution, waste management, and environmental impact.",
        "min_expected_risks": 1,
        "weight": 0.6,
        "recommendations_if_missing": [
            "Assess risks from nearby water bodies (rivers, harbours, docks)",
            "Include noise management plan and monitoring points",
            "Document waste management and sanitation facilities plan",
            "Specify environmental impact mitigation measures",
        ],
    },
}


@dataclass
class CategoryCoverage:
    """Coverage assessment for a single hazard category."""
    category: str
    display_name: str
    risk_count: int
    min_expected: int
    coverage_ratio: float          # 0.0 – 1.0+
    status: str                    # "well_covered", "partial", "gap"
    avg_confidence: float
    risk_ids: list[str] = field(default_factory=list)
    has_scored_risks: bool = False  # whether any risk has an explicit L×C score
    recommendations: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "category": self.category,
            "display_name": self.display_name,
            "risk_count": self.risk_count,
            "min_expected": self.min_expected,
            "coverage_ratio": round(self.coverage_ratio, 2),
            "status": self.status,
            "avg_confidence": round(self.avg_confidence, 2),
            "risk_ids": self.risk_ids,
            "has_scored_risks": self.has_scored_risks,
            "recommendations": self.recommendations,
        }


@dataclass
class GapAnalysis:
    """Full gap analysis result."""
    total_risks: int
    categories_covered: int
    categories_total: int
    categories_with_gaps: int
    completeness_score: float      # 0 – 100
    overall_status: str            # "comprehensive", "adequate", "incomplete", "critical"
    category_details: list[CategoryCoverage] = field(default_factory=list)
    uncovered_categories: list[str] = field(default_factory=list)
    top_recommendations: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "total_risks": self.total_risks,
            "categories_covered": self.categories_covered,
            "categories_total": self.categories_total,
            "categories_with_gaps": self.categories_with_gaps,
            "completeness_score": round(self.completeness_score, 1),
            "overall_status": self.overall_status,
            "category_details": [c.to_dict() for c in self.category_details],
            "uncovered_categories": self.uncovered_categories,
            "top_recommendations": self.top_recommendations,
        }


def analyze_gaps(risks: list[ExtractedRisk]) -> GapAnalysis:
    """Run gap analysis on extracted risks.

    Parameters
    ----------
    risks : list[ExtractedRisk]
        Risks extracted by the risk_extractor module.

    Returns
    -------
    GapAnalysis
        Comprehensive coverage assessment with recommendations.
    """
    logger.info("🔍 Running gap analysis on %d extracted risks", len(risks))

    # Count risks per category
    cat_counts = Counter(r.hazard_category for r in risks)

    # Group risks by category for detailed analysis
    cat_risks: dict[str, list[ExtractedRisk]] = {cat: [] for cat in HAZARD_CATEGORIES}
    for r in risks:
        if r.hazard_category in cat_risks:
            cat_risks[r.hazard_category].append(r)

    details: list[CategoryCoverage] = []
    total_weighted_score = 0.0
    total_weight = 0.0

    for cat in HAZARD_CATEGORIES:
        meta = _CATEGORY_META[cat]
        count = cat_counts.get(cat, 0)
        min_exp = meta["min_expected_risks"]
        ratio = count / max(min_exp, 1)

        # Determine status
        if ratio >= 1.0:
            status = "well_covered"
        elif ratio >= 0.5:
            status = "partial"
        else:
            status = "gap"

        # Average confidence
        cat_risk_list = cat_risks[cat]
        avg_conf = (
            sum(r.confidence for r in cat_risk_list) / len(cat_risk_list)
            if cat_risk_list else 0.0
        )

        # Check for scored risks (L×C)
        has_scored = any(r.risk_score is not None for r in cat_risk_list)

        # Recommendations
        recs: list[str] = []
        if status == "gap":
            recs = meta["recommendations_if_missing"][:3]
        elif status == "partial":
            recs = meta["recommendations_if_missing"][:2]
        if not has_scored and count > 0:
            recs.append(f"Add quantitative risk scoring (L×C) for {meta['display_name']} risks")

        cov = CategoryCoverage(
            category=cat,
            display_name=meta["display_name"],
            risk_count=count,
            min_expected=min_exp,
            coverage_ratio=round(ratio, 2),
            status=status,
            avg_confidence=avg_conf,
            risk_ids=[r.id for r in cat_risk_list],
            has_scored_risks=has_scored,
            recommendations=recs,
        )
        details.append(cov)

        # Weighted scoring
        weight = meta["weight"]
        category_score = min(ratio, 1.5) / 1.5  # cap at 1.5x coverage
        if has_scored:
            category_score = min(category_score + 0.1, 1.0)  # bonus for quantified risks
        total_weighted_score += category_score * weight
        total_weight += weight

    # ── Overall metrics ─────────────────────────────────────────────────
    completeness = (total_weighted_score / max(total_weight, 1)) * 100
    covered = sum(1 for d in details if d.risk_count > 0)
    gaps = sum(1 for d in details if d.status == "gap")
    uncovered = [d.category for d in details if d.risk_count == 0]

    if completeness >= 80:
        overall = "comprehensive"
    elif completeness >= 60:
        overall = "adequate"
    elif completeness >= 35:
        overall = "incomplete"
    else:
        overall = "critical"

    # ── Top recommendations (prioritised) ───────────────────────────────
    top_recs: list[str] = []
    # First: fully uncovered categories
    for d in details:
        if d.status == "gap" and d.recommendations:
            top_recs.append(
                f"[{d.display_name}] {d.recommendations[0]}"
            )
    # Then: partial categories
    for d in details:
        if d.status == "partial" and d.recommendations:
            top_recs.append(
                f"[{d.display_name}] {d.recommendations[0]}"
            )
    top_recs = top_recs[:10]

    result = GapAnalysis(
        total_risks=len(risks),
        categories_covered=covered,
        categories_total=len(HAZARD_CATEGORIES),
        categories_with_gaps=gaps,
        completeness_score=completeness,
        overall_status=overall,
        category_details=details,
        uncovered_categories=uncovered,
        top_recommendations=top_recs,
    )

    logger.info(
        "✅ Gap analysis complete: %.1f%% coverage — %s (%d/%d categories covered, %d gaps)",
        completeness, overall, covered, len(HAZARD_CATEGORIES), gaps,
    )
    return result
