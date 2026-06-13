"""Risk Assessment API endpoints for CrowdShield.

Endpoints
─────────
GET /api/risk/composite?date={date}     → full composite risk assessment
GET /api/risk/timeline?date={date}      → risk score over time for an event day
GET /api/risk/benchmark                 → cross-event comparison data
GET /api/risk/benchmark/{date}          → single event positioned against benchmarks
GET /api/risk/predict                   → predicted risk profile for next event
"""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from src.analytics.benchmarking import (
    get_full_benchmark,
    get_single_event_benchmark,
)
from src.analytics.composite_risk import (
    compute_composite_risk,
    compute_predicted_risk,
)
from src.etl.data_store import store

router = APIRouter(prefix="/api/risk", tags=["risk"])


# ═════════════════════════════════════════════════════════════════════════════
# Composite Risk
# ═════════════════════════════════════════════════════════════════════════════


@router.get("/composite")
async def composite_risk(
    date_filter: Annotated[date | None, Query(alias="date")] = None,
    w_document: Annotated[float | None, Query(alias="w_doc", ge=0, le=1)] = None,
    w_anomaly: Annotated[float | None, Query(alias="w_anom", ge=0, le=1)] = None,
    w_density: Annotated[float | None, Query(alias="w_dens", ge=0, le=1)] = None,
) -> dict:
    """Full composite risk assessment for an event date.

    Parameters
    ----------
    date_filter : date, optional
        Event date (YYYY-MM-DD). If omitted, uses all available data.
    w_document : float, optional
        Weight for document risk component (0–1).
    w_anomaly : float, optional
        Weight for historical anomaly component (0–1).
    w_density : float, optional
        Weight for density prediction component (0–1).
    """
    # Validate date exists in data
    if date_filter is not None:
        _validate_event_date(date_filter)

    # Build custom weights if any are provided
    weights = None
    if any(w is not None for w in [w_document, w_anomaly, w_density]):
        weights = {
            "document": w_document if w_document is not None else 0.3,
            "anomaly": w_anomaly if w_anomaly is not None else 0.4,
            "density": w_density if w_density is not None else 0.3,
        }

    try:
        result = compute_composite_risk(target_date=date_filter, weights=weights)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to compute composite risk: {exc}",
        ) from exc

    return {
        "event_date": result.event_date,
        "overall_risk_level": result.overall_risk_level,
        "overall_risk_score": result.overall_risk_score,
        "component_scores": result.component_scores,
        "risk_by_category": result.risk_by_category,
        "weights_used": result.weights_used,
        "metadata": result.metadata,
        "timeline_points": len(result.risk_timeline),
    }


@router.get("/timeline")
async def risk_timeline(
    date_filter: Annotated[date | None, Query(alias="date")] = None,
) -> dict:
    """Risk score over time for an event day.

    Returns the per-timeslot composite risk score, showing how risk
    evolves through ingress → peak → egress.

    Parameters
    ----------
    date_filter : date, optional
        Event date (YYYY-MM-DD).
    """
    if date_filter is not None:
        _validate_event_date(date_filter)

    try:
        result = compute_composite_risk(target_date=date_filter)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to compute risk timeline: {exc}",
        ) from exc

    # Compute summary statistics from the timeline
    timeline = result.risk_timeline
    if timeline:
        scores = [t["composite_score"] for t in timeline]
        summary = {
            "peak_risk_score": max(scores),
            "mean_risk_score": round(sum(scores) / len(scores), 4),
            "min_risk_score": min(scores),
            "time_above_elevated": sum(1 for s in scores if s > 0.25),
            "time_above_high": sum(1 for s in scores if s > 0.50),
            "time_above_critical": sum(1 for s in scores if s > 0.75),
        }
    else:
        summary = {}

    return {
        "event_date": result.event_date,
        "overall_risk_level": result.overall_risk_level,
        "overall_risk_score": result.overall_risk_score,
        "timeline_summary": summary,
        "total_points": len(timeline),
        "timeline": timeline,
    }


# ═════════════════════════════════════════════════════════════════════════════
# Benchmarking
# ═════════════════════════════════════════════════════════════════════════════


@router.get("/benchmark")
async def cross_event_benchmark() -> dict:
    """Cross-event comparison data.

    Returns comparison table, percentile rankings, pattern similarity,
    and predictive ranges across all observed event fingerprints.
    """
    try:
        return get_full_benchmark()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to compute benchmarks: {exc}",
        ) from exc


@router.get("/benchmark/{target_date}")
async def single_event_benchmark(target_date: date) -> dict:
    """Single event positioned against historical benchmarks.

    Parameters
    ----------
    target_date : date
        Event date to benchmark (YYYY-MM-DD).
    """
    try:
        result = get_single_event_benchmark(target_date)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to compute single-event benchmark: {exc}",
        ) from exc

    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    return result


# ═════════════════════════════════════════════════════════════════════════════
# Prediction
# ═════════════════════════════════════════════════════════════════════════════


@router.get("/predict")
async def predicted_risk() -> dict:
    """Predicted risk profile for the next event based on historical patterns.

    Uses the mean and variance of composite risk scores across all observed
    event dates to predict the expected risk range for a future event.
    """
    try:
        return compute_predicted_risk()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to compute predicted risk: {exc}",
        ) from exc


# ═════════════════════════════════════════════════════════════════════════════
# Helpers
# ═════════════════════════════════════════════════════════════════════════════


def _validate_event_date(target_date: date) -> None:
    """Raise 404 if the target date has no data in the store."""
    df = store.telcofy_summary
    if df.empty:
        raise HTTPException(status_code=503, detail="Telcofy data not loaded")

    available = df["batch_data"].unique()
    if target_date not in available:
        raise HTTPException(
            status_code=404,
            detail=f"No data for date {target_date}. "
                   f"Available dates: {sorted(str(d) for d in available)}",
        )
