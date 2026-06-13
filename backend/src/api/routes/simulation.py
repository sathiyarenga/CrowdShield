"""Crowd simulation API endpoints — v2 with transport hubs and scenario planning."""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.simulation import SimConfig, Origin, run_simulation, _detect_transport_hubs

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/spatial", tags=["simulation"])

VENUE_CENTERS: dict[str, tuple[float, float]] = {
    "galway": (53.2707, -9.0545),
    "ullevaal": (59.9486, 10.7335),
}


# ═════════════════════════════════════════════════════════════════════════════
# Request/Response models
# ═════════════════════════════════════════════════════════════════════════════

class OriginSpec(BaseModel):
    """A crowd origin/destination point."""
    lat: float
    lon: float
    name: str = ""
    hub_type: str = "custom"
    crowd_share: float = Field(default=0.0, ge=0, le=1.0)
    arrival_offset_min: float = Field(default=30, ge=0, le=180)
    arrival_spread_min: float = Field(default=30, ge=5, le=120)


class SimulationRequest(BaseModel):
    """Request body for running a crowd simulation."""
    num_agents: int = Field(default=2000, ge=100, le=50000)
    scenario: Literal["ingress", "egress", "bidirectional"] = "ingress"
    total_time: float = Field(default=600.0, ge=30, le=3600)
    desired_speed: float = Field(default=1.2, ge=0.5, le=2.5)
    domain_radius: float = Field(default=400.0, ge=100, le=2000)
    origins: list[OriginSpec] = Field(default_factory=list)
    destinations: list[OriginSpec] = Field(default_factory=list)
    avoid_polygons: list[dict] | None = None


# ═════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═════════════════════════════════════════════════════════════════════════════


@router.get("/{venue_id}/transport-hubs")
async def get_transport_hubs(venue_id: str, radius: int = 1200) -> dict:
    """
    Auto-detect transport hubs (train stations, bus stops, parking)
    around a venue using OSM Overpass API.

    Returns suggested origins with default crowd shares for simulation.
    Planners can edit these before running a simulation.
    """
    center = VENUE_CENTERS.get(venue_id)
    if not center:
        raise HTTPException(status_code=404, detail=f"Unknown venue: {venue_id}")

    hubs = _detect_transport_hubs(center[0], center[1], radius)

    return {
        "venue_id": venue_id,
        "center": list(center),
        "radius": radius,
        "hubs": [
            {
                "lat": h.lat,
                "lon": h.lon,
                "name": h.name,
                "hub_type": h.hub_type,
                "crowd_share": h.crowd_share,
                "arrival_offset_min": h.arrival_offset_min,
                "arrival_spread_min": h.arrival_spread_min,
            }
            for h in hubs
        ],
        "total_hubs": len(hubs),
    }


@router.post("/{venue_id}/simulate")
def simulate_crowd(venue_id: str, request: SimulationRequest) -> dict:
    """
    Run a route-based crowd flow simulation.

    If no origins are provided, auto-detects transport hubs from OSM.
    Agents walk along real streets via ORS pedestrian routing.
    Supports road closures via avoid_polygons.
    """
    center = VENUE_CENTERS.get(venue_id)
    if not center:
        raise HTTPException(status_code=404, detail=f"Unknown venue: {venue_id}")

    logger.info(
        f"🏃 Sim: {request.num_agents} agents, {request.scenario}, "
        f"{len(request.origins)} custom origins for {venue_id}"
    )

    # Convert request origins to internal format
    origins = [
        Origin(
            lat=o.lat, lon=o.lon, name=o.name, hub_type=o.hub_type,
            crowd_share=o.crowd_share, arrival_offset_min=o.arrival_offset_min,
            arrival_spread_min=o.arrival_spread_min,
        )
        for o in request.origins
    ]

    config = SimConfig(
        num_agents=request.num_agents,
        scenario=request.scenario,
        total_time=request.total_time,
        desired_speed=request.desired_speed,
        domain_radius=request.domain_radius,
        origins=origins,
        avoid_polygons=request.avoid_polygons,
    )

    try:
        result = run_simulation(config, center)
    except Exception as e:
        logger.error(f"Simulation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Simulation failed: {str(e)}")

    return {
        "trips": result.trajectories,
        "stats": result.stats,
        "config": result.config,
        "origins_used": result.origins_used,
        "metadata": {
            "venue_id": venue_id,
            "center": list(center),
            "engine": "Route-based v2 (ORS + OSM transport hubs)",
        },
    }
