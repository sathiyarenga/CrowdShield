"""Venue GIS API endpoints for the CrowdShield map layer.

Endpoints
─────────
GET /api/venues/                          → list all venue configs
GET /api/venues/{venue_id}                → venue detail + zone GeoJSON
GET /api/venues/{venue_id}/risk-markers   → risk overlay point markers
GET /api/venues/{venue_id}/density-points → heatmap weighted point cloud
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from src.etl.data_store import store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/venues", tags=["venues"])


# ═════════════════════════════════════════════════════════════════════════════
# Custom Zone Models & Storage
# ═════════════════════════════════════════════════════════════════════════════

ZoneType = Literal[
    "gate", "stage", "crowd_corridor", "medical",
    "vip", "parking", "buffer", "custom",
]


class GeoJSONPolygonGeometry(BaseModel):
    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[list[float]]]


class CustomZoneCreate(BaseModel):
    name: str
    zone_type: ZoneType
    capacity: int = Field(ge=0)
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    geometry: GeoJSONPolygonGeometry


class CustomZoneUpdate(BaseModel):
    name: str | None = None
    zone_type: ZoneType | None = None
    capacity: int | None = Field(default=None, ge=0)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    geometry: GeoJSONPolygonGeometry | None = None


ZONES_DIR = Path(__file__).resolve().parents[3] / "data" / "zones"


def _zones_path(venue_id: str) -> Path:
    """Return the JSON file path for a venue's custom zones."""
    return ZONES_DIR / f"{venue_id}_custom.json"


def _read_zones(venue_id: str) -> dict:
    """Load the GeoJSON FeatureCollection from disk (or empty default)."""
    path = _zones_path(venue_id)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"type": "FeatureCollection", "features": []}


def _write_zones(venue_id: str, collection: dict) -> None:
    """Persist a GeoJSON FeatureCollection to disk."""
    ZONES_DIR.mkdir(parents=True, exist_ok=True)
    path = _zones_path(venue_id)
    path.write_text(json.dumps(collection, indent=2, default=str), encoding="utf-8")


# ═════════════════════════════════════════════════════════════════════════════
# Venue Configuration
# ═════════════════════════════════════════════════════════════════════════════

VENUES: dict[str, dict] = {
    "ullevaal": {
        "id": "ullevaal",
        "name": "Ullevaal Stadion",
        "city": "Oslo",
        "country": "Norway",
        "center": [10.734, 59.948],
        "zoom": 14.5,
        "pitch": 45,
        "bearing": -20,
        "has_telemetry": True,
        "event_dates": [
            "2025-09-03",
            "2025-09-04",
            "2025-09-09",
            "2025-10-11",
            "2025-10-12",
        ],
    },
    "galway": {
        "id": "galway",
        "name": "The Whale Street Spectacle",
        "city": "Galway",
        "country": "Ireland",
        "center": [-9.0545, 53.2707],
        "zoom": 17,
        "pitch": 45,
        "bearing": 0,
        "has_telemetry": False,
        "event_dates": ["2026-07-17", "2026-07-18"],
    },
}


# ── Galway venue polygon ────────────────────────────────────────────────────

_GALWAY_POLYGON_COORDS = [
    [-9.0530, 53.2695],
    [-9.0522, 53.2712],
    [-9.0548, 53.2720],
    [-9.0565, 53.2715],
    [-9.0558, 53.2698],
]

_GALWAY_AREA_SQM = 8_000.0


# ═════════════════════════════════════════════════════════════════════════════
# Helpers
# ═════════════════════════════════════════════════════════════════════════════


def _venue_or_404(venue_id: str) -> dict:
    """Return venue config or raise 404."""
    venue = VENUES.get(venue_id)
    if venue is None:
        raise HTTPException(status_code=404, detail=f"Unknown venue: {venue_id}")
    return venue


def _polygon_bbox(coords: list[list[float]]) -> tuple[float, float, float, float]:
    """Return (min_lon, min_lat, max_lon, max_lat) for a polygon ring."""
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return min(lons), min(lats), max(lons), max(lats)


def _point_in_polygon(lon: float, lat: float, coords: list[list[float]]) -> bool:
    """Ray-casting point-in-polygon test."""
    n = len(coords)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = coords[i]
        xj, yj = coords[j]
        if ((yi > lat) != (yj > lat)) and (
            lon < (xj - xi) * (lat - yi) / (yj - yi) + xi
        ):
            inside = not inside
        j = i
    return inside


def _deterministic_offset(
    seed: str, bbox: tuple[float, float, float, float]
) -> tuple[float, float]:
    """Hash-based stable (lon, lat) within a bounding box."""
    h = hashlib.md5(seed.encode()).hexdigest()
    frac_lon = int(h[:8], 16) / 0xFFFFFFFF
    frac_lat = int(h[8:16], 16) / 0xFFFFFFFF
    min_lon, min_lat, max_lon, max_lat = bbox
    return (
        min_lon + frac_lon * (max_lon - min_lon),
        min_lat + frac_lat * (max_lat - min_lat),
    )


def _spread_points_in_polygon(
    coords: list[list[float]], count: int
) -> list[tuple[float, float]]:
    """Generate *count* evenly spread points inside *coords* via grid sampling."""
    bbox = _polygon_bbox(coords)
    min_lon, min_lat, max_lon, max_lat = bbox
    # Determine grid dimensions to guarantee enough interior points
    side = max(int(math.ceil(math.sqrt(count * 2))), 4)
    step_lon = (max_lon - min_lon) / side
    step_lat = (max_lat - min_lat) / side
    pts: list[tuple[float, float]] = []
    for i in range(side):
        for j in range(side):
            lon = min_lon + step_lon * (i + 0.5)
            lat = min_lat + step_lat * (j + 0.5)
            if _point_in_polygon(lon, lat, coords):
                pts.append((lon, lat))
            if len(pts) >= count:
                return pts
    return pts


def _build_ullevaal_zone_features() -> list[dict]:
    """Convert DataStore.telcofy_areas to GeoJSON features."""
    df = store.telcofy_areas
    if df.empty:
        return []

    features: list[dict] = []
    for _, row in df.iterrows():
        geometry = None
        area_sqm = row.get("area_sqm") or 0
        if row.get("geometry") is not None:
            try:
                from shapely.geometry import mapping

                geometry = mapping(row["geometry"])
            except Exception:
                pass

        feature = {
            "type": "Feature",
            "properties": {
                "zone_id": row.get("id"),
                "zone_name": row.get("area_name"),
                "area_sqm": round(area_sqm, 0) if area_sqm else None,
                "capacity_estimate": {
                    "comfortable": int(area_sqm * 2) if area_sqm else None,
                    "dense": int(area_sqm * 4) if area_sqm else None,
                },
            },
            "geometry": geometry,
        }
        features.append(feature)
    return features


def _build_galway_zone_feature() -> dict:
    """Build a single GeoJSON feature for the Galway event route."""
    ring = _GALWAY_POLYGON_COORDS + [_GALWAY_POLYGON_COORDS[0]]  # close the ring
    return {
        "type": "Feature",
        "properties": {
            "zone_id": "galway-event-route",
            "zone_name": "Event Route",
            "area_sqm": _GALWAY_AREA_SQM,
            "capacity_estimate": {
                "comfortable": int(_GALWAY_AREA_SQM * 2),
                "dense": int(_GALWAY_AREA_SQM * 4),
            },
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [ring],
        },
    }


# ── Lazy extraction reuse from documents.py ─────────────────────────────────


def _ensure_extraction() -> None:
    """Delegate to the document pipeline's lazy extraction."""
    if store.doc_risks is not None:
        return

    logger.info("📄 Venues: triggering document extraction for risk markers…")
    from src.api.routes.documents import _ensure_extraction as _docs_extract

    _docs_extract()


# ── Location keyword mapping for Galway risks ──────────────────────────────

_LOCATION_KEYWORDS: dict[str, tuple[float, float]] = {
    "stage": (-9.0540, 53.2710),
    "entrance": (-9.0528, 53.2700),
    "gate": (-9.0528, 53.2700),
    "barrier": (-9.0555, 53.2712),
    "route": (-9.0545, 53.2707),
    "exit": (-9.0560, 53.2705),
    "crowd": (-9.0545, 53.2707),
    "pedestrian": (-9.0535, 53.2705),
    "vehicle": (-9.0560, 53.2698),
    "crossing": (-9.0550, 53.2700),
}


def _locate_risk(risk: dict, bbox: tuple[float, float, float, float]) -> tuple[float, float]:
    """Determine a coordinate for a risk based on keyword matching + deterministic hash."""
    text = f"{risk.get('title', '')} {risk.get('description', '')}".lower()

    # Check for location keywords
    for keyword, (lon, lat) in _LOCATION_KEYWORDS.items():
        if keyword in text:
            # Add a small deterministic jitter so markers in the same category don't stack
            h = hashlib.md5(str(risk.get("id", "")).encode()).hexdigest()
            jitter_lon = (int(h[:4], 16) / 0xFFFF - 0.5) * 0.0004
            jitter_lat = (int(h[4:8], 16) / 0xFFFF - 0.5) * 0.0003
            return (lon + jitter_lon, lat + jitter_lat)

    # Fallback: deterministic position within the venue polygon
    return _deterministic_offset(str(risk.get("id", "")), bbox)


def _severity_label(score: int | None) -> str:
    """Map a numeric risk score (1-25) to a severity label."""
    if score is None:
        return "unscored"
    if score >= 15:
        return "critical"
    if score >= 10:
        return "high"
    if score >= 5:
        return "medium"
    return "low"


# ═════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═════════════════════════════════════════════════════════════════════════════


@router.get("/")
async def list_venues() -> dict:
    """Return all venue configurations (without zone geometry)."""
    return {
        "total": len(VENUES),
        "venues": list(VENUES.values()),
    }


@router.get("/{venue_id}")
async def venue_detail(venue_id: str) -> dict:
    """Return venue config + zones as a GeoJSON FeatureCollection."""
    venue = _venue_or_404(venue_id)

    if venue_id == "ullevaal":
        features = _build_ullevaal_zone_features()
    else:
        # Non-telemetry venues start with an empty canvas
        # Users draw their own zones via the Zone Drawing tool
        features = []

    return {
        **venue,
        "zones": {
            "type": "FeatureCollection",
            "features": features,
        },
    }


@router.get("/{venue_id}/risk-markers")
async def venue_risk_markers(venue_id: str) -> dict:
    """Return GeoJSON FeatureCollection of risk overlay point markers."""
    venue = _venue_or_404(venue_id)

    if venue_id == "ullevaal":
        # No document intelligence for the telemetry venue
        return {"type": "FeatureCollection", "features": []}

    if venue_id != "galway":
        return {"type": "FeatureCollection", "features": []}

    # Trigger lazy extraction
    _ensure_extraction()

    risks = store.doc_risks
    if not risks:
        return {"type": "FeatureCollection", "features": []}

    features: list[dict] = []
    for risk in risks:
        score = risk.get("risk_score")
        feature = {
            "type": "Feature",
            "properties": {
                "risk_id": risk.get("id"),
                "title": risk.get("title"),
                "hazard_category": risk.get("hazard_category"),
                "risk_score": score,
                "severity_label": _severity_label(score),
                "source_page": risk.get("source_page"),
            },
            "geometry": None,  # Not geolocated — extracted from document text
        }
        features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features,
        "geolocated": False,
    }


@router.get("/{venue_id}/density-points")
async def venue_density_points(
    venue_id: str,
    date_filter: Annotated[date | None, Query(alias="date")] = None,
    index: Annotated[int | None, Query(ge=0, description="Time-series index")] = None,
) -> dict:
    """Return GeoJSON FeatureCollection of weighted points for heatmap rendering."""
    venue = _venue_or_404(venue_id)

    features: list[dict] = []
    points_per_zone = 20

    if venue_id == "ullevaal":
        features = _ullevaal_density(date_filter, index, points_per_zone)
    elif venue_id == "galway":
        features = _galway_density(points_per_zone)

    return {"type": "FeatureCollection", "features": features}


# ── Density helpers ─────────────────────────────────────────────────────────


def _ullevaal_density(
    date_filter: date | None,
    index: int | None,
    points_per_zone: int,
) -> list[dict]:
    """Generate density points for Ullevaal from telcofy zone data."""
    areas_df = store.telcofy_areas
    summary_df = store.telcofy_summary

    if areas_df.empty:
        return []

    # Determine the target date for crowd counts
    target_date = date_filter or date(2025, 9, 9)

    features: list[dict] = []
    for _, zone in areas_df.iterrows():
        geometry = zone.get("geometry")
        zone_name = zone.get("area_name")

        if geometry is None:
            continue

        try:
            from shapely.geometry import mapping

            geo_dict = mapping(geometry)
        except Exception:
            continue

        # Determine crowd count for this zone
        people = 0
        if not summary_df.empty:
            zone_data = summary_df[
                (summary_df["batch_data"] == target_date)
                & (summary_df["area_name"] == zone_name)
            ]
            if not zone_data.empty:
                if index is not None and index < len(zone_data):
                    people = int(zone_data.iloc[index]["people"])
                else:
                    # Use peak value
                    people = int(zone_data["people"].max())

        # Extract polygon coords for point generation
        if geo_dict["type"] == "Polygon":
            coords = geo_dict["coordinates"][0]
        elif geo_dict["type"] == "MultiPolygon":
            coords = geo_dict["coordinates"][0][0]
        else:
            continue

        pts = _spread_points_in_polygon(coords, points_per_zone)
        weight = people / max(len(pts), 1)

        for lon, lat in pts:
            features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "weight": round(weight, 1),
                        "zone_name": zone_name,
                    },
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                }
            )

    return features


def _galway_density(points_per_zone: int) -> list[dict]:
    """Generate uniform density points for the Galway event route."""
    # Estimated comfortable capacity for the route
    comfortable_capacity = int(_GALWAY_AREA_SQM * 2)
    pts = _spread_points_in_polygon(_GALWAY_POLYGON_COORDS, points_per_zone)
    weight = comfortable_capacity / max(len(pts), 1)

    features: list[dict] = []
    for lon, lat in pts:
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "weight": round(weight, 1),
                    "zone_name": "Event Route",
                },
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
            }
        )
    return features


# ═════════════════════════════════════════════════════════════════════════════
# Custom Zone CRUD Endpoints
# ═════════════════════════════════════════════════════════════════════════════


@router.get("/{venue_id}/zones/custom")
async def list_custom_zones(venue_id: str) -> dict:
    """Return all custom zones for a venue as a GeoJSON FeatureCollection."""
    _venue_or_404(venue_id)
    return _read_zones(venue_id)


@router.post("/{venue_id}/zones/custom", status_code=201)
async def create_custom_zone(venue_id: str, body: CustomZoneCreate) -> dict:
    """Create a new custom zone. Returns the created GeoJSON Feature."""
    _venue_or_404(venue_id)
    now = datetime.utcnow().isoformat() + "Z"
    zone_id = str(uuid.uuid4())

    feature: dict = {
        "type": "Feature",
        "properties": {
            "zone_id": zone_id,
            "name": body.name,
            "zone_type": body.zone_type,
            "capacity": body.capacity,
            "color": body.color,
            "created_at": now,
            "updated_at": now,
        },
        "geometry": body.geometry.model_dump(),
    }

    collection = _read_zones(venue_id)
    collection["features"].append(feature)
    _write_zones(venue_id, collection)

    return feature


@router.put("/{venue_id}/zones/custom/{zone_id}")
async def update_custom_zone(
    venue_id: str, zone_id: str, body: CustomZoneUpdate
) -> dict:
    """Update an existing custom zone's properties or geometry."""
    _venue_or_404(venue_id)
    collection = _read_zones(venue_id)

    for feature in collection["features"]:
        if feature["properties"].get("zone_id") == zone_id:
            props = feature["properties"]
            if body.name is not None:
                props["name"] = body.name
            if body.zone_type is not None:
                props["zone_type"] = body.zone_type
            if body.capacity is not None:
                props["capacity"] = body.capacity
            if body.color is not None:
                props["color"] = body.color
            if body.geometry is not None:
                feature["geometry"] = body.geometry.model_dump()
            props["updated_at"] = datetime.utcnow().isoformat() + "Z"

            _write_zones(venue_id, collection)
            return feature

    raise HTTPException(status_code=404, detail=f"Zone not found: {zone_id}")


@router.delete("/{venue_id}/zones/custom/{zone_id}")
async def delete_custom_zone(venue_id: str, zone_id: str) -> dict:
    """Delete a custom zone by zone_id."""
    _venue_or_404(venue_id)
    collection = _read_zones(venue_id)

    original_len = len(collection["features"])
    collection["features"] = [
        f for f in collection["features"]
        if f["properties"].get("zone_id") != zone_id
    ]

    if len(collection["features"]) == original_len:
        raise HTTPException(status_code=404, detail=f"Zone not found: {zone_id}")

    _write_zones(venue_id, collection)
    return {"detail": "deleted", "zone_id": zone_id}


@router.get("/{venue_id}/zones/templates")
async def list_zone_templates(venue_id: str) -> dict:
    """Return all saved custom zones as reusable templates (name + type + geometry)."""
    _venue_or_404(venue_id)
    collection = _read_zones(venue_id)

    templates: list[dict] = []
    for feature in collection["features"]:
        props = feature["properties"]
        templates.append({
            "zone_id": props.get("zone_id"),
            "name": props.get("name"),
            "zone_type": props.get("zone_type"),
            "capacity": props.get("capacity"),
            "color": props.get("color"),
            "geometry": feature.get("geometry"),
        })

    return {"total": len(templates), "templates": templates}
