"""Health check endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from src.etl.data_store import store

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("")
async def health_check() -> dict:
    """Return system health status including data availability.

    Returns
    -------
    dict
        Status, data counts, and connectivity info.
    """
    return {
        "status": "healthy",
        "data_loaded": store.is_loaded(),
        "datasets": {
            "telcofy_summary": len(store.telcofy_summary),
            "telcofy_breakdown": len(store.telcofy_breakdown),
            "telcofy_areas": len(store.telcofy_areas),
            "telia_daily": len(store.telia_daily),
            "telia_hourly": len(store.telia_hourly),
            "telia_areas": len(store.telia_areas),
            "ullevaal_baselines": len(store.ullevaal_baselines),
            "ullevaal_fingerprints": len(store.ullevaal_fingerprints),
            "fredrikstad_baselines": len(store.fredrikstad_baselines),
        },
        "database": "not_configured (in-memory mode)",
    }
