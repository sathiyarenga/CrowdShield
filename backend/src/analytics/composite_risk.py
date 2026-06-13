"""Composite Risk Scoring Engine for CrowdShield.

Combines three independent risk signals into a unified 0–1 risk index:

    Risk Index = w₁ × DocumentRiskScore
               + w₂ × HistoricalAnomalyScore
               + w₃ × DensityPredictionScore

Default weights: w₁=0.3, w₂=0.4, w₃=0.3
(Historical anomaly data is weighted highest — that's the USP.)

Risk-level thresholds (on 0–1 score):
    ≤ 0.25 → nominal
    ≤ 0.50 → elevated
    ≤ 0.75 → high
    > 0.75 → critical
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date
from typing import Literal

import numpy as np
import pandas as pd

from src.analytics.anomaly_detection import score_ullevaal_timeseries
from src.etl.data_store import store

logger = logging.getLogger(__name__)

# ── Default weight configuration ────────────────────────────────────────────
DEFAULT_WEIGHTS = {
    "document": 0.3,
    "anomaly": 0.4,
    "density": 0.3,
}

# ── Risk-level thresholds ───────────────────────────────────────────────────
RISK_THRESHOLDS: list[tuple[float, str]] = [
    (0.75, "critical"),
    (0.50, "high"),
    (0.25, "elevated"),
]

# ── Likelihood × Consequence matrix values (ISO 31000 style 5×5) ───────────
_LIKELIHOOD_MAP = {
    "RARE": 1, "UNLIKELY": 2, "POSSIBLE": 3, "LIKELY": 4, "ALMOST_CERTAIN": 5,
    "rare": 1, "unlikely": 2, "possible": 3, "likely": 4, "almost_certain": 5,
    # Numeric fallbacks
    "1": 1, "2": 2, "3": 3, "4": 4, "5": 5,
}
_CONSEQUENCE_MAP = {
    "INSIGNIFICANT": 1, "MINOR": 2, "MODERATE": 3, "MAJOR": 4, "CATASTROPHIC": 5,
    "insignificant": 1, "minor": 2, "moderate": 3, "major": 4, "catastrophic": 5,
    "1": 1, "2": 2, "3": 3, "4": 4, "5": 5,
}
_MAX_LC_SCORE = 25.0  # 5 × 5


# ── Dataclass output ────────────────────────────────────────────────────────

@dataclass
class CompositeRiskResult:
    """Full composite-risk assessment for a single event date."""

    event_date: str
    overall_risk_level: Literal["nominal", "elevated", "high", "critical"]
    overall_risk_score: float  # 0–1
    component_scores: dict  # {"document": ..., "anomaly": ..., "density": ...}
    risk_timeline: list[dict]  # per-timeslot risk scores
    risk_by_category: dict  # hazard_category → risk_level
    weights_used: dict = field(default_factory=lambda: DEFAULT_WEIGHTS.copy())
    metadata: dict = field(default_factory=dict)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _classify_risk_level(score: float) -> str:
    """Map a 0–1 score to a risk-level label."""
    for threshold, level in RISK_THRESHOLDS:
        if score > threshold:
            return level
    return "nominal"


def _parse_lc_score(risk_item: dict) -> float | None:
    """Extract a Likelihood × Consequence score from a doc_risks item.

    Tries several key names the AI extractor might have used.
    Returns a float in [0, 25] or None if parsing fails.
    """
    # Direct L×C score
    for key in ("lc_score", "risk_score", "score", "lxc"):
        val = risk_item.get(key)
        if val is not None:
            try:
                return float(val)
            except (ValueError, TypeError):
                pass

    # Likelihood and Consequence as separate fields
    likelihood_raw = risk_item.get("likelihood") or risk_item.get("probability")
    consequence_raw = risk_item.get("consequence") or risk_item.get("impact") or risk_item.get("severity")

    if likelihood_raw is not None and consequence_raw is not None:
        l_val = _LIKELIHOOD_MAP.get(str(likelihood_raw).strip())
        c_val = _CONSEQUENCE_MAP.get(str(consequence_raw).strip())
        if l_val is None:
            try:
                l_val = int(float(str(likelihood_raw)))
            except (ValueError, TypeError):
                l_val = None
        if c_val is None:
            try:
                c_val = int(float(str(consequence_raw)))
            except (ValueError, TypeError):
                c_val = None
        if l_val is not None and c_val is not None:
            return float(l_val * c_val)

    return None


def _get_category(risk_item: dict) -> str:
    """Extract the hazard category string from a doc_risks item."""
    for key in ("category", "hazard_category", "hazard", "type", "risk_type"):
        val = risk_item.get(key)
        if val:
            return str(val).upper().replace(" ", "_")
    return "UNCLASSIFIED"


# ═════════════════════════════════════════════════════════════════════════════
# Component scorers
# ═════════════════════════════════════════════════════════════════════════════

def compute_document_risk_score() -> tuple[float, dict[str, float]]:
    """Compute overall document risk score (0–1) and per-category scores.

    Uses L×C scores extracted from doc_risks, normalised to [0, 1].

    Returns
    -------
    tuple[float, dict[str, float]]
        (overall_score, {category: score})
    """
    risks = store.doc_risks
    if not risks:
        logger.info("No doc_risks available — document risk score = 0.0")
        return 0.0, {}

    category_scores: dict[str, list[float]] = {}
    for item in risks:
        lc = _parse_lc_score(item)
        if lc is None:
            continue
        cat = _get_category(item)
        normalised = min(lc / _MAX_LC_SCORE, 1.0)
        category_scores.setdefault(cat, []).append(normalised)

    if not category_scores:
        logger.warning("Could not parse any L×C scores from %d doc_risks items", len(risks))
        return 0.0, {}

    # Per-category: take the max risk within each category (worst-case)
    per_cat: dict[str, float] = {
        cat: round(max(scores), 4)
        for cat, scores in category_scores.items()
    }

    # Overall: weighted average biased toward worst categories
    # Use root-mean-square to penalise high individual categories
    all_maxes = list(per_cat.values())
    overall = float(np.sqrt(np.mean(np.square(all_maxes))))
    overall = round(min(overall, 1.0), 4)

    logger.info(
        "Document risk: overall=%.3f across %d categories (%d items parsed)",
        overall, len(per_cat), sum(len(v) for v in category_scores.values()),
    )
    return overall, per_cat


def compute_anomaly_score(target_date: date | None = None) -> tuple[float, list[dict]]:
    """Compute historical anomaly score (0–1) for a date.

    Maps Z-scores to [0, 1] using: score = min(|z| / 4.0, 1.0)
    (A Z-score of 4σ or higher saturates at 1.0.)

    Returns
    -------
    tuple[float, list[dict]]
        (peak_anomaly_score, timeline_entries)
        where each timeline entry has: {timestamp, people, z_score, anomaly_score, severity}
    """
    scored = score_ullevaal_timeseries(target_date=target_date)
    if scored.empty:
        logger.info("No anomaly scores available for date=%s", target_date)
        return 0.0, []

    # Map Z-scores → 0–1
    scored = scored.copy()
    scored["anomaly_score"] = scored["z_score"].abs().clip(upper=4.0) / 4.0
    scored["anomaly_score"] = scored["anomaly_score"].round(4)

    # Timeline entries
    timeline_cols = ["timestamp", "people", "z_score", "anomaly_score", "severity"]
    available_cols = [c for c in timeline_cols if c in scored.columns]
    timeline = scored[available_cols].copy()
    if "timestamp" in timeline.columns:
        timeline["timestamp"] = timeline["timestamp"].astype(str)

    timeline_records = timeline.to_dict(orient="records")

    # Overall score: peak anomaly during the window
    peak_score = float(scored["anomaly_score"].max())

    logger.info(
        "Anomaly score for %s: peak=%.3f, %d observations",
        target_date, peak_score, len(scored),
    )
    return round(peak_score, 4), timeline_records


def compute_density_score(target_date: date | None = None) -> float:
    """Compute density-prediction score (0–1) as current peak vs historical capacity.

    Uses the ratio: peak_observed / historical_max_capacity
    Capped at 1.0.

    Returns
    -------
    float
        Score in [0, 1].
    """
    df = store.telcofy_summary
    if df.empty:
        logger.info("No summary data — density score = 0.0")
        return 0.0

    baselines = store.ullevaal_baselines
    if baselines.empty:
        logger.info("No baselines — density score = 0.0")
        return 0.0

    # Get the baseline floor
    baseline_floor = baselines["overnight_floor_mean"].iloc[0] if "overnight_floor_mean" in baselines.columns else 0.0

    # Historical maximum across ALL event dates (our capacity reference)
    historical_max = float(df["people"].max())

    # Current date's peak
    if target_date is not None:
        day_df = df[df["batch_data"] == target_date]
        if day_df.empty:
            return 0.0
        current_peak = float(day_df["people"].max())
    else:
        current_peak = historical_max

    # Compute: how much of the capacity headroom is used?
    capacity_range = historical_max - baseline_floor
    if capacity_range <= 0:
        return 0.0

    score = (current_peak - baseline_floor) / capacity_range
    score = min(max(score, 0.0), 1.0)

    logger.info(
        "Density score for %s: %.3f (peak=%d, hist_max=%d, floor=%d)",
        target_date, score, current_peak, historical_max, baseline_floor,
    )
    return round(score, 4)


# ═════════════════════════════════════════════════════════════════════════════
# Main composite scorer
# ═════════════════════════════════════════════════════════════════════════════

def compute_composite_risk(
    target_date: date | None = None,
    weights: dict[str, float] | None = None,
) -> CompositeRiskResult:
    """Compute the full composite risk assessment for an event date.

    Parameters
    ----------
    target_date : date, optional
        Event date to assess. If None, uses most recent data.
    weights : dict, optional
        Override default weights {"document": w1, "anomaly": w2, "density": w3}.

    Returns
    -------
    CompositeRiskResult
        Full assessment with component scores, timeline, and category breakdown.
    """
    w = weights or DEFAULT_WEIGHTS.copy()
    # Normalise weights to sum to 1.0
    w_total = sum(w.values())
    if w_total > 0:
        w = {k: v / w_total for k, v in w.items()}

    logger.info("Computing composite risk for date=%s with weights=%s", target_date, w)

    # ── Component 1: Document Risk ──────────────────────────────────────
    doc_score, doc_categories = compute_document_risk_score()

    # ── Component 2: Historical Anomaly ─────────────────────────────────
    anomaly_score, anomaly_timeline = compute_anomaly_score(target_date)

    # ── Component 3: Density Prediction ─────────────────────────────────
    density_score = compute_density_score(target_date)

    # ── Composite ───────────────────────────────────────────────────────
    overall = (
        w.get("document", 0.3) * doc_score
        + w.get("anomaly", 0.4) * anomaly_score
        + w.get("density", 0.3) * density_score
    )
    overall = round(min(max(overall, 0.0), 1.0), 4)
    risk_level = _classify_risk_level(overall)

    # ── Risk timeline (per time-slot composite) ─────────────────────────
    risk_timeline: list[dict] = []
    for entry in anomaly_timeline:
        slot_anomaly = entry.get("anomaly_score", 0.0)
        slot_composite = (
            w.get("document", 0.3) * doc_score  # doc score is static for the event
            + w.get("anomaly", 0.4) * slot_anomaly
            + w.get("density", 0.3) * density_score  # density is static for the event
        )
        slot_composite = round(min(max(slot_composite, 0.0), 1.0), 4)
        risk_timeline.append({
            "timestamp": entry.get("timestamp"),
            "people": entry.get("people"),
            "anomaly_score": slot_anomaly,
            "composite_score": slot_composite,
            "risk_level": _classify_risk_level(slot_composite),
        })

    # ── Per-category risk levels ────────────────────────────────────────
    risk_by_category = {
        cat: _classify_risk_level(score)
        for cat, score in doc_categories.items()
    }

    # ── Determine effective date string ─────────────────────────────────
    date_str = str(target_date) if target_date else "all"

    result = CompositeRiskResult(
        event_date=date_str,
        overall_risk_level=risk_level,
        overall_risk_score=overall,
        component_scores={
            "document": {
                "score": doc_score,
                "weight": round(w.get("document", 0.3), 4),
                "weighted": round(w.get("document", 0.3) * doc_score, 4),
                "categories": doc_categories,
            },
            "anomaly": {
                "score": anomaly_score,
                "weight": round(w.get("anomaly", 0.4), 4),
                "weighted": round(w.get("anomaly", 0.4) * anomaly_score, 4),
            },
            "density": {
                "score": density_score,
                "weight": round(w.get("density", 0.3), 4),
                "weighted": round(w.get("density", 0.3) * density_score, 4),
            },
        },
        risk_timeline=risk_timeline,
        risk_by_category=risk_by_category,
        weights_used=w,
        metadata={
            "total_doc_risks": len(store.doc_risks) if store.doc_risks else 0,
            "anomaly_observations": len(anomaly_timeline),
            "timeline_points": len(risk_timeline),
        },
    )

    logger.info(
        "Composite risk for %s: score=%.3f level=%s "
        "(doc=%.3f, anomaly=%.3f, density=%.3f)",
        date_str, overall, risk_level, doc_score, anomaly_score, density_score,
    )
    return result


def compute_predicted_risk(weights: dict[str, float] | None = None) -> dict:
    """Predict a risk profile for the *next* event based on historical patterns.

    Uses the mean and std of component scores across all observed event dates
    to produce a predictive range.

    Returns
    -------
    dict
        Predicted risk profile with expected ranges.
    """
    df = store.telcofy_summary
    if df.empty:
        return {"error": "No historical data available for prediction"}

    event_dates = sorted(df["batch_data"].unique())
    if not event_dates:
        return {"error": "No event dates found"}

    # Compute composite risk for each historical event
    per_event_scores: list[dict] = []
    for d in event_dates:
        result = compute_composite_risk(target_date=d, weights=weights)
        per_event_scores.append({
            "date": str(d),
            "overall": result.overall_risk_score,
            "document": result.component_scores["document"]["score"],
            "anomaly": result.component_scores["anomaly"]["score"],
            "density": result.component_scores["density"]["score"],
        })

    scores_df = pd.DataFrame(per_event_scores)

    # Statistics
    prediction = {
        "based_on_events": len(per_event_scores),
        "event_dates": [s["date"] for s in per_event_scores],
        "predicted_overall": {
            "mean": round(float(scores_df["overall"].mean()), 4),
            "std": round(float(scores_df["overall"].std()), 4) if len(scores_df) > 1 else 0.0,
            "min": round(float(scores_df["overall"].min()), 4),
            "max": round(float(scores_df["overall"].max()), 4),
            "predicted_level": _classify_risk_level(float(scores_df["overall"].mean())),
        },
        "predicted_components": {},
        "per_event_history": per_event_scores,
    }

    for component in ["document", "anomaly", "density"]:
        prediction["predicted_components"][component] = {
            "mean": round(float(scores_df[component].mean()), 4),
            "std": round(float(scores_df[component].std()), 4) if len(scores_df) > 1 else 0.0,
            "range": [
                round(float(scores_df[component].min()), 4),
                round(float(scores_df[component].max()), 4),
            ],
        }

    logger.info(
        "Predicted risk profile: mean=%.3f ± %.3f based on %d events",
        prediction["predicted_overall"]["mean"],
        prediction["predicted_overall"]["std"],
        len(per_event_scores),
    )
    return prediction
