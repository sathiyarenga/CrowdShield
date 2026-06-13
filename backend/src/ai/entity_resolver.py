"""Entity resolution — cross-page risk linking and conflict detection.

Groups related risks from different pages/sections (e.g. "crowd management"
mentioned in several contexts) and detects potential conflicts (e.g.
"maximum capacity 5000" vs "expected attendance 8000").
"""

from __future__ import annotations

import logging
import re
from collections import defaultdict
from dataclasses import dataclass, field
from difflib import SequenceMatcher

from src.ai.risk_extractor import ExtractedRisk

logger = logging.getLogger(__name__)

# ═════════════════════════════════════════════════════════════════════════════
# Data models
# ═════════════════════════════════════════════════════════════════════════════


@dataclass
class RiskCluster:
    """A group of related risks across different pages/sections."""
    cluster_id: str
    theme: str
    risk_ids: list[str] = field(default_factory=list)
    pages: list[int] = field(default_factory=list)
    categories: list[str] = field(default_factory=list)
    representative_title: str = ""
    description_summary: str = ""
    count: int = 0

    def to_dict(self) -> dict:
        return {
            "cluster_id": self.cluster_id,
            "theme": self.theme,
            "risk_ids": self.risk_ids,
            "pages": sorted(set(self.pages)),
            "categories": sorted(set(self.categories)),
            "representative_title": self.representative_title,
            "description_summary": self.description_summary,
            "count": self.count,
        }


@dataclass
class Conflict:
    """A potential conflict between two risk statements."""
    conflict_id: str
    type: str  # "numeric_mismatch", "contradictory_controls", "capacity_conflict", "scoring_inconsistency"
    severity: str  # "low", "medium", "high"
    description: str
    risk_a_id: str
    risk_a_page: int
    risk_a_text: str
    risk_b_id: str
    risk_b_page: int
    risk_b_text: str

    def to_dict(self) -> dict:
        return {
            "conflict_id": self.conflict_id,
            "type": self.type,
            "severity": self.severity,
            "description": self.description,
            "risk_a": {"id": self.risk_a_id, "page": self.risk_a_page, "text": self.risk_a_text[:200]},
            "risk_b": {"id": self.risk_b_id, "page": self.risk_b_page, "text": self.risk_b_text[:200]},
        }


@dataclass
class EntityResolution:
    """Full entity resolution result."""
    clusters: list[RiskCluster]
    conflicts: list[Conflict]
    total_risks: int
    total_clusters: int
    total_conflicts: int
    cross_page_references: int

    def to_dict(self) -> dict:
        return {
            "total_risks": self.total_risks,
            "total_clusters": self.total_clusters,
            "total_conflicts": self.total_conflicts,
            "cross_page_references": self.cross_page_references,
            "clusters": [c.to_dict() for c in self.clusters],
            "conflicts": [c.to_dict() for c in self.conflicts],
        }


# ═════════════════════════════════════════════════════════════════════════════
# Thematic grouping patterns
# ═════════════════════════════════════════════════════════════════════════════

_THEMES: dict[str, list[str]] = {
    "crowd_management": [
        "crowd", "crush", "stampede", "density", "overcrowd",
        "capacity", "occupancy", "ingress", "egress", "flow",
        "gathering", "assembly", "spectator",
    ],
    "emergency_evacuation": [
        "evacuat", "emergency exit", "assembly point",
        "emergency plan", "emergency response", "emergency procedure",
        "clear the area", "lockdown",
    ],
    "water_safety": [
        "river", "corrib", "drown", "water safety", "waterway",
        "bridge", "quay", "dock", "harbour", "canal", "tide",
    ],
    "traffic_roads": [
        "traffic", "road closure", "vehicle", "parking",
        "pedestrian", "junction", "crossing", "diversion",
        "transport", "bus", "coach",
    ],
    "medical_welfare": [
        "medical", "first aid", "ambulance", "paramedic",
        "hospital", "casualty", "injury", "welfare", "triage",
        "aed", "defibrillator",
    ],
    "steward_security": [
        "steward", "marshal", "security", "garda",
        "sla", "briefing", "patrol", "checkpoint",
    ],
    "structures_barriers": [
        "barrier", "fencing", "stage", "scaffold", "marquee",
        "structure", "rigging", "lighting", "generator",
    ],
    "communications": [
        "radio", "communication", "pa system", "public address",
        "control room", "announcement", "cctv", "camera",
        "mobile", "telephone", "signal",
    ],
    "weather_conditions": [
        "weather", "wind", "rain", "storm", "lightning",
        "forecast", "temperature", "adverse",
    ],
}

# ── Numeric extraction for conflict detection ───────────────────────────────
_CAPACITY_PATTERN = re.compile(
    r"(?:capacity|maximum|max\.?|limit|attendance|crowd size|occupancy)"
    r"\s*(?:of|is|:)?\s*(\d[\d,]*)",
    re.I,
)
_NUMBER_PATTERN = re.compile(r"\b(\d[\d,]{2,})\b")
_TIME_PATTERN = re.compile(
    r"(?:from|start|begin|open)\s+(\d{1,2}[:.]\d{2})"
    r".*?(?:to|until|end|close|finish)\s+(\d{1,2}[:.]\d{2})",
    re.I,
)


def _text_similarity(a: str, b: str) -> float:
    """Compute text similarity between two strings (0-1)."""
    if not a or not b:
        return 0.0
    # Normalise
    a_norm = re.sub(r"[^a-z0-9 ]", "", a.lower()).strip()
    b_norm = re.sub(r"[^a-z0-9 ]", "", b.lower()).strip()
    return SequenceMatcher(None, a_norm, b_norm).ratio()


def _classify_theme(text: str) -> str | None:
    """Classify text into the best matching theme."""
    text_lower = text.lower()
    scores: dict[str, int] = {}
    for theme, keywords in _THEMES.items():
        score = sum(1 for kw in keywords if kw in text_lower)
        if score > 0:
            scores[theme] = score
    if not scores:
        return None
    return max(scores, key=scores.get)  # type: ignore[arg-type]


# ═════════════════════════════════════════════════════════════════════════════
# Clustering
# ═════════════════════════════════════════════════════════════════════════════

def _cluster_risks(risks: list[ExtractedRisk]) -> list[RiskCluster]:
    """Group related risks into thematic clusters."""
    # First pass: group by theme
    theme_groups: dict[str, list[ExtractedRisk]] = defaultdict(list)
    unthemed: list[ExtractedRisk] = []

    for risk in risks:
        combined_text = f"{risk.title} {risk.description}"
        theme = _classify_theme(combined_text)
        if theme:
            theme_groups[theme].append(risk)
        else:
            unthemed.append(risk)

    # Second pass: try to merge unthemed into existing clusters by similarity
    for risk in unthemed:
        best_theme = None
        best_sim = 0.0
        for theme, members in theme_groups.items():
            for member in members[:3]:
                sim = _text_similarity(risk.title, member.title)
                if sim > best_sim:
                    best_sim = sim
                    best_theme = theme
        if best_theme and best_sim > 0.3:
            theme_groups[best_theme].append(risk)
        else:
            # Create its own cluster based on category
            theme_groups[f"other_{risk.hazard_category}"].append(risk)

    # Third pass: within each theme, sub-cluster by title similarity
    clusters: list[RiskCluster] = []
    cluster_id = 0

    for theme, members in sorted(theme_groups.items()):
        if not members:
            continue

        # Sub-cluster using simple greedy matching
        used = set()
        for i, risk_a in enumerate(members):
            if i in used:
                continue
            sub_group = [risk_a]
            used.add(i)
            for j, risk_b in enumerate(members):
                if j in used:
                    continue
                sim = _text_similarity(risk_a.title, risk_b.title)
                if sim > 0.4 or (risk_a.hazard_category == risk_b.hazard_category and sim > 0.25):
                    sub_group.append(risk_b)
                    used.add(j)

            cluster_id += 1
            # Pick the longest title as representative
            rep = max(sub_group, key=lambda r: len(r.title))

            cluster = RiskCluster(
                cluster_id=f"CLU-{cluster_id:03d}",
                theme=theme,
                risk_ids=[r.id for r in sub_group],
                pages=[r.source_page for r in sub_group],
                categories=[r.hazard_category for r in sub_group],
                representative_title=rep.title,
                description_summary=rep.description[:300],
                count=len(sub_group),
            )
            clusters.append(cluster)

    return clusters


# ═════════════════════════════════════════════════════════════════════════════
# Conflict detection
# ═════════════════════════════════════════════════════════════════════════════

def _detect_conflicts(risks: list[ExtractedRisk]) -> list[Conflict]:
    """Find potential conflicts across risks."""
    conflicts: list[Conflict] = []
    conflict_id = 0

    # ── 1) Capacity/numeric contradictions ──────────────────────────────
    capacity_values: list[tuple[ExtractedRisk, int]] = []
    for risk in risks:
        combined = f"{risk.title} {risk.description} {risk.source_text}"
        for m in _CAPACITY_PATTERN.finditer(combined):
            val = int(m.group(1).replace(",", ""))
            if 50 <= val <= 1_000_000:  # reasonable capacity range
                capacity_values.append((risk, val))

    # Compare all pairs of capacity values
    for i, (risk_a, val_a) in enumerate(capacity_values):
        for risk_b, val_b in capacity_values[i + 1:]:
            if risk_a.source_page == risk_b.source_page:
                continue  # same page, probably the same table
            # Flag if they differ by more than 50% and are about the same theme
            if val_a > 0 and val_b > 0:
                ratio = max(val_a, val_b) / min(val_a, val_b)
                if ratio > 1.5:
                    combined_a = f"{risk_a.title} {risk_a.description}"
                    combined_b = f"{risk_b.title} {risk_b.description}"
                    theme_a = _classify_theme(combined_a)
                    theme_b = _classify_theme(combined_b)
                    if theme_a == theme_b or _text_similarity(risk_a.title, risk_b.title) > 0.25:
                        conflict_id += 1
                        severity = "high" if ratio > 2.0 else "medium"
                        conflicts.append(Conflict(
                            conflict_id=f"CON-{conflict_id:03d}",
                            type="capacity_conflict",
                            severity=severity,
                            description=(
                                f"Numeric inconsistency: {val_a:,} (page {risk_a.source_page}) "
                                f"vs {val_b:,} (page {risk_b.source_page}). "
                                f"Ratio {ratio:.1f}x difference."
                            ),
                            risk_a_id=risk_a.id,
                            risk_a_page=risk_a.source_page,
                            risk_a_text=risk_a.source_text,
                            risk_b_id=risk_b.id,
                            risk_b_page=risk_b.source_page,
                            risk_b_text=risk_b.source_text,
                        ))

    # ── 2) Scoring inconsistencies ──────────────────────────────────────
    # Same category + similar topic but very different risk scores
    scored_risks = [r for r in risks if r.risk_score is not None]
    for i, risk_a in enumerate(scored_risks):
        for risk_b in scored_risks[i + 1:]:
            if risk_a.hazard_category != risk_b.hazard_category:
                continue
            if risk_a.source_page == risk_b.source_page:
                continue

            sim = _text_similarity(risk_a.title, risk_b.title)
            if sim < 0.35:
                continue

            score_diff = abs((risk_a.risk_score or 0) - (risk_b.risk_score or 0))
            if score_diff >= 6:
                conflict_id += 1
                conflicts.append(Conflict(
                    conflict_id=f"CON-{conflict_id:03d}",
                    type="scoring_inconsistency",
                    severity="medium" if score_diff < 10 else "high",
                    description=(
                        f"Similar risks scored differently: "
                        f"'{risk_a.title[:60]}' scored {risk_a.risk_score} (p.{risk_a.source_page}) "
                        f"vs '{risk_b.title[:60]}' scored {risk_b.risk_score} (p.{risk_b.source_page})."
                    ),
                    risk_a_id=risk_a.id,
                    risk_a_page=risk_a.source_page,
                    risk_a_text=risk_a.source_text,
                    risk_b_id=risk_b.id,
                    risk_b_page=risk_b.source_page,
                    risk_b_text=risk_b.source_text,
                ))

    # ── 3) Contradictory likelihood/consequence ─────────────────────────
    lik_order = {"low": 0, "medium": 1, "high": 2, "very_high": 3}
    con_order = {"minor": 0, "moderate": 1, "major": 2, "catastrophic": 3}

    for i, risk_a in enumerate(risks):
        for risk_b in risks[i + 1:]:
            if risk_a.hazard_category != risk_b.hazard_category:
                continue
            if risk_a.source_page == risk_b.source_page:
                continue

            sim = _text_similarity(risk_a.title, risk_b.title)
            if sim < 0.45:
                continue

            lik_diff = abs(
                lik_order.get(risk_a.likelihood, 1) - lik_order.get(risk_b.likelihood, 1)
            )
            con_diff = abs(
                con_order.get(risk_a.consequence, 1) - con_order.get(risk_b.consequence, 1)
            )

            if lik_diff >= 2 or con_diff >= 2:
                conflict_id += 1
                conflicts.append(Conflict(
                    conflict_id=f"CON-{conflict_id:03d}",
                    type="contradictory_controls",
                    severity="medium",
                    description=(
                        f"Similar risks have different severity assessments: "
                        f"'{risk_a.title[:50]}' — L={risk_a.likelihood}/C={risk_a.consequence} (p.{risk_a.source_page}) "
                        f"vs L={risk_b.likelihood}/C={risk_b.consequence} (p.{risk_b.source_page})."
                    ),
                    risk_a_id=risk_a.id,
                    risk_a_page=risk_a.source_page,
                    risk_a_text=risk_a.source_text,
                    risk_b_id=risk_b.id,
                    risk_b_page=risk_b.source_page,
                    risk_b_text=risk_b.source_text,
                ))

    return conflicts


# ═════════════════════════════════════════════════════════════════════════════
# Main entry point
# ═════════════════════════════════════════════════════════════════════════════

def resolve_entities(risks: list[ExtractedRisk]) -> EntityResolution:
    """Run full entity resolution: clustering + conflict detection.

    Parameters
    ----------
    risks : list[ExtractedRisk]
        Extracted risks from the risk_extractor module.

    Returns
    -------
    EntityResolution
    """
    logger.info("🔗 Running entity resolution on %d risks", len(risks))

    clusters = _cluster_risks(risks)
    conflicts = _detect_conflicts(risks)

    # Count cross-page references (clusters spanning multiple pages)
    cross_page = sum(
        1 for c in clusters if len(set(c.pages)) > 1
    )

    result = EntityResolution(
        clusters=clusters,
        conflicts=conflicts,
        total_risks=len(risks),
        total_clusters=len(clusters),
        total_conflicts=len(conflicts),
        cross_page_references=cross_page,
    )

    logger.info(
        "✅ Entity resolution: %d clusters, %d cross-page refs, %d conflicts",
        len(clusters), cross_page, len(conflicts),
    )
    return result
