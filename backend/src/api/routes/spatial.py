"""Spatial intelligence API endpoints for CrowdShield.

Endpoints
─────────
GET /api/spatial/{venue_id}/facilities   → OSM facilities (hospitals, police, fire, etc.)
GET /api/spatial/{venue_id}/roads        → Road network with capacity metadata
GET /api/spatial/{venue_id}/transit       → Public transit stops
GET /api/spatial/{venue_id}/isochrones   → Walking-time isochrones via OpenRouteService
GET /api/spatial/{venue_id}/route        → Pedestrian route between two points
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import time
from pathlib import Path
from typing import Annotated

import httpx
from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/spatial", tags=["spatial"])

# ═════════════════════════════════════════════════════════════════════════════
# Configuration
# ═════════════════════════════════════════════════════════════════════════════

OVERPASS_API = "https://overpass-api.de/api/interpreter"
ORS_API = "https://api.openrouteservice.org/v2"
ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjU2NTRiMGFlYTUwZTQ3NGVhOGE3ZjBmZDgyODA5MDQzIiwiaCI6Im11cm11cjY0In0="
CACHE_DIR = Path(__file__).resolve().parents[3] / "data" / "spatial_cache"
CACHE_TTL_SECONDS = 86400  # 24 hours

# Venue centers (duplicated from venues.py for independence)
VENUE_CENTERS: dict[str, tuple[float, float]] = {
    "ullevaal": (59.948, 10.734),   # lat, lon
    "galway": (53.2707, -9.0545),
}

# Facility type configuration
FACILITY_TYPES = {
    "hospital": {
        "icon": "hospital",
        "color": "#ef4444",
        "label": "Hospital",
        "osm_tags": '"amenity"="hospital"',
    },
    "police": {
        "icon": "police",
        "color": "#3b82f6",
        "label": "Police Station",
        "osm_tags": '"amenity"="police"',
    },
    "fire_station": {
        "icon": "fire_station",
        "color": "#f97316",
        "label": "Fire Station",
        "osm_tags": '"amenity"="fire_station"',
    },
    "pharmacy": {
        "icon": "pharmacy",
        "color": "#22c55e",
        "label": "Pharmacy",
        "osm_tags": '"amenity"="pharmacy"',
    },
    "clinic": {
        "icon": "clinic",
        "color": "#ec4899",
        "label": "Clinic / Doctor",
        "osm_tags": '"amenity"~"clinic|doctors"',
    },
}

TRANSIT_TYPES = {
    "bus_stop": {
        "icon": "bus",
        "color": "#eab308",
        "label": "Bus Stop",
        "osm_tags": '"highway"="bus_stop"',
    },
    "tram_stop": {
        "icon": "tram",
        "color": "#8b5cf6",
        "label": "Tram Stop",
        "osm_tags": '"railway"="tram_stop"',
    },
    "train_station": {
        "icon": "train",
        "color": "#6366f1",
        "label": "Train Station",
        "osm_tags": '"railway"~"station|halt"',
    },
}

# ═════════════════════════════════════════════════════════════════════════════
# Helpers
# ═════════════════════════════════════════════════════════════════════════════


def _venue_center_or_404(venue_id: str) -> tuple[float, float]:
    """Return (lat, lon) for a venue or raise 404."""
    center = VENUE_CENTERS.get(venue_id)
    if center is None:
        raise HTTPException(status_code=404, detail=f"Unknown venue: {venue_id}")
    return center


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two lat/lon points in kilometers."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _walking_minutes(distance_km: float) -> float:
    """Estimate walking time in minutes (avg 5 km/h)."""
    return round(distance_km / 5.0 * 60, 1)


def _cache_key(venue_id: str, query_type: str, radius: int) -> str:
    """Generate a deterministic cache key."""
    raw = f"{venue_id}:{query_type}:{radius}"
    return hashlib.md5(raw.encode()).hexdigest()


def _read_cache(key: str) -> dict | None:
    """Read cached Overpass response if still fresh."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"{key}.json"
    if not cache_file.exists():
        return None
    data = json.loads(cache_file.read_text(encoding="utf-8"))
    if time.time() - data.get("cached_at", 0) > CACHE_TTL_SECONDS:
        return None
    return data.get("payload")


def _write_cache(key: str, payload: dict) -> None:
    """Write Overpass response to disk cache."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"{key}.json"
    cache_file.write_text(
        json.dumps({"cached_at": time.time(), "payload": payload}, default=str),
        encoding="utf-8",
    )


async def _query_overpass(query: str) -> dict:
    """Execute an Overpass API query with timeout and error handling."""
    async with httpx.AsyncClient(
        timeout=30.0,
        headers={"User-Agent": "CrowdShield/1.0 (crowd safety platform)"},
    ) as client:
        try:
            resp = await client.post(
                OVERPASS_API,
                data={"data": query},
            )
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"Overpass API error: {e.response.status_code}")
            raise HTTPException(
                status_code=502,
                detail=f"Overpass API returned {e.response.status_code}",
            )
        except httpx.TimeoutException:
            logger.error("Overpass API timeout")
            raise HTTPException(status_code=504, detail="Overpass API timeout")
        except Exception as e:
            logger.error(f"Overpass API error: {e}")
            raise HTTPException(status_code=502, detail=str(e))


def _osm_element_to_feature(
    element: dict,
    facility_type: str,
    config: dict,
    venue_lat: float,
    venue_lon: float,
) -> dict | None:
    """Convert an OSM element to a GeoJSON Feature."""
    tags = element.get("tags", {})
    name = tags.get("name", config["label"])

    # Get coordinates
    if element["type"] == "node":
        lat = element.get("lat")
        lon = element.get("lon")
    elif element["type"] in ("way", "relation"):
        # `out center;` provides centroid in "center" field
        center = element.get("center", {})
        lat = center.get("lat")
        lon = center.get("lon")
    else:
        return None

    if lat is None or lon is None:
        return None

    distance_km = _haversine_km(venue_lat, venue_lon, lat, lon)

    return {
        "type": "Feature",
        "properties": {
            "osm_id": element.get("id"),
            "name": name,
            "facility_type": facility_type,
            "icon": config["icon"],
            "color": config["color"],
            "label": config["label"],
            "distance_km": round(distance_km, 2),
            "walking_minutes": _walking_minutes(distance_km),
            "address": tags.get("addr:street", ""),
            "phone": tags.get("phone", tags.get("contact:phone", "")),
            "website": tags.get("website", tags.get("contact:website", "")),
            "opening_hours": tags.get("opening_hours", ""),
            "emergency": tags.get("emergency", ""),
            "operator": tags.get("operator", ""),
        },
        "geometry": {
            "type": "Point",
            "coordinates": [lon, lat],
        },
    }


# ═════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═════════════════════════════════════════════════════════════════════════════


@router.get("/{venue_id}/facilities")
async def venue_facilities(
    venue_id: str,
    radius: Annotated[int, Query(ge=500, le=10000, description="Search radius in meters")] = 5000,
    types: Annotated[str | None, Query(description="Comma-separated facility types filter")] = None,
) -> dict:
    """
    Return GeoJSON FeatureCollection of real-world facilities near a venue.

    Queries OpenStreetMap Overpass API for hospitals, police stations,
    fire stations, pharmacies, and clinics. Results are cached for 24 hours.

    Parameters:
    - radius: Search radius in meters (500-10000, default 5000)
    - types: Comma-separated filter (e.g. "hospital,police"). Default: all types.
    """
    lat, lon = _venue_center_or_404(venue_id)

    # Filter facility types
    if types:
        requested = set(types.split(","))
        active_types = {k: v for k, v in FACILITY_TYPES.items() if k in requested}
    else:
        active_types = FACILITY_TYPES

    if not active_types:
        return {"type": "FeatureCollection", "features": [], "metadata": {}}

    # Check cache
    cache_key = _cache_key(venue_id, "facilities_" + "_".join(sorted(active_types.keys())), radius)
    cached = _read_cache(cache_key)
    if cached is not None:
        logger.info(f"📦 Spatial: returning cached facilities for {venue_id}")
        return cached

    # Build Overpass query
    tag_queries = []
    for _type_name, config in active_types.items():
        tag = config["osm_tags"]
        tag_queries.append(f'  node[{tag}](around:{radius},{lat},{lon});')
        tag_queries.append(f'  way[{tag}](around:{radius},{lat},{lon});')
        tag_queries.append(f'  relation[{tag}](around:{radius},{lat},{lon});')

    query = f"""[out:json][timeout:25];
(
{chr(10).join(tag_queries)}
);
out center;"""

    logger.info(f"🌍 Spatial: querying Overpass for facilities near {venue_id} (r={radius}m)")
    raw = await _query_overpass(query)

    # Convert to GeoJSON features
    features: list[dict] = []
    seen_ids: set[int] = set()

    for element in raw.get("elements", []):
        osm_id = element.get("id")
        if osm_id in seen_ids:
            continue
        seen_ids.add(osm_id)

        tags = element.get("tags", {})
        if not tags:
            continue

        # Determine facility type
        amenity = tags.get("amenity", "")
        for type_name, config in active_types.items():
            # Match by amenity tag
            if type_name == "clinic" and amenity in ("clinic", "doctors"):
                feature = _osm_element_to_feature(element, type_name, config, lat, lon)
                if feature:
                    features.append(feature)
                break
            elif amenity == type_name:
                feature = _osm_element_to_feature(element, type_name, config, lat, lon)
                if feature:
                    features.append(feature)
                break

    # Sort by distance
    features.sort(key=lambda f: f["properties"]["distance_km"])

    result = {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "venue_id": venue_id,
            "center": [lon, lat],
            "radius_m": radius,
            "total": len(features),
            "types_queried": list(active_types.keys()),
            "source": "OpenStreetMap via Overpass API",
        },
    }

    _write_cache(cache_key, result)
    return result


@router.get("/{venue_id}/transit")
async def venue_transit(
    venue_id: str,
    radius: Annotated[int, Query(ge=500, le=10000, description="Search radius in meters")] = 3000,
) -> dict:
    """
    Return GeoJSON FeatureCollection of public transit stops near a venue.

    Queries OpenStreetMap for bus stops, tram stops, and train stations.
    """
    lat, lon = _venue_center_or_404(venue_id)

    # Check cache
    cache_key = _cache_key(venue_id, "transit", radius)
    cached = _read_cache(cache_key)
    if cached is not None:
        logger.info(f"📦 Spatial: returning cached transit for {venue_id}")
        return cached

    # Build query for all transit types
    tag_queries = []
    for config in TRANSIT_TYPES.values():
        tag = config["osm_tags"]
        tag_queries.append(f'  node[{tag}](around:{radius},{lat},{lon});')

    query = f"""[out:json][timeout:25];
(
{chr(10).join(tag_queries)}
);
out center;"""

    logger.info(f"🚌 Spatial: querying Overpass for transit near {venue_id} (r={radius}m)")
    raw = await _query_overpass(query)

    features: list[dict] = []
    seen_ids: set[int] = set()

    for element in raw.get("elements", []):
        osm_id = element.get("id")
        if osm_id in seen_ids:
            continue
        seen_ids.add(osm_id)

        tags = element.get("tags", {})
        if not tags:
            continue

        # Determine transit type
        transit_type = None
        config = None

        if tags.get("highway") == "bus_stop":
            transit_type = "bus_stop"
            config = TRANSIT_TYPES["bus_stop"]
        elif tags.get("railway") == "tram_stop":
            transit_type = "tram_stop"
            config = TRANSIT_TYPES["tram_stop"]
        elif tags.get("railway") in ("station", "halt"):
            transit_type = "train_station"
            config = TRANSIT_TYPES["train_station"]

        if transit_type and config:
            feature = _osm_element_to_feature(element, transit_type, config, lat, lon)
            if feature:
                features.append(feature)

    features.sort(key=lambda f: f["properties"]["distance_km"])

    result = {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "venue_id": venue_id,
            "center": [lon, lat],
            "radius_m": radius,
            "total": len(features),
            "source": "OpenStreetMap via Overpass API",
        },
    }

    _write_cache(cache_key, result)
    return result


@router.get("/{venue_id}/roads")
async def venue_roads(
    venue_id: str,
    radius: Annotated[int, Query(ge=500, le=5000, description="Search radius in meters")] = 2000,
) -> dict:
    """
    Return GeoJSON FeatureCollection of the road network near a venue.

    Includes road type, lane count, and estimated pedestrian capacity.
    """
    lat, lon = _venue_center_or_404(venue_id)

    cache_key = _cache_key(venue_id, "roads", radius)
    cached = _read_cache(cache_key)
    if cached is not None:
        logger.info(f"📦 Spatial: returning cached roads for {venue_id}")
        return cached

    query = f"""[out:json][timeout:30];
(
  way["highway"~"primary|secondary|tertiary|residential|footway|pedestrian|path|living_street|service"](around:{radius},{lat},{lon});
);
out body geom;"""

    logger.info(f"🛣️ Spatial: querying Overpass for roads near {venue_id} (r={radius}m)")
    raw = await _query_overpass(query)

    # Default road widths by type (meters)
    DEFAULT_WIDTHS: dict[str, float] = {
        "primary": 14.0,
        "secondary": 10.0,
        "tertiary": 8.0,
        "residential": 6.0,
        "living_street": 5.0,
        "service": 4.0,
        "footway": 2.0,
        "pedestrian": 6.0,
        "path": 1.5,
    }

    # Capacity in pedestrians per meter width per minute (Fruin LoS C)
    PED_FLOW_RATE = 25  # peds/m/min at comfortable density

    features: list[dict] = []
    for element in raw.get("elements", []):
        if element["type"] != "way":
            continue

        tags = element.get("tags", {})
        geometry_points = element.get("geometry", [])
        if not geometry_points or len(geometry_points) < 2:
            continue

        highway_type = tags.get("highway", "residential")
        lanes = int(tags.get("lanes", 0)) or None
        width_tag = tags.get("width", "")

        # Parse width
        try:
            width_m = float(width_tag.replace("m", "").strip())
        except (ValueError, AttributeError):
            width_m = DEFAULT_WIDTHS.get(highway_type, 6.0)

        # Estimate pedestrian capacity
        ped_capacity_ppm = round(width_m * PED_FLOW_RATE)  # peds per minute

        # Capacity rating
        if ped_capacity_ppm >= 200:
            capacity_rating = "high"
        elif ped_capacity_ppm >= 100:
            capacity_rating = "medium"
        else:
            capacity_rating = "low"

        coords = [[p["lon"], p["lat"]] for p in geometry_points]

        features.append({
            "type": "Feature",
            "properties": {
                "osm_id": element.get("id"),
                "name": tags.get("name", ""),
                "highway_type": highway_type,
                "lanes": lanes,
                "width_m": width_m,
                "surface": tags.get("surface", ""),
                "lit": tags.get("lit", ""),
                "ped_capacity_ppm": ped_capacity_ppm,
                "capacity_rating": capacity_rating,
                "oneway": tags.get("oneway", "no"),
                "maxspeed": tags.get("maxspeed", ""),
            },
            "geometry": {
                "type": "LineString",
                "coordinates": coords,
            },
        })

    result = {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "venue_id": venue_id,
            "center": [lon, lat],
            "radius_m": radius,
            "total": len(features),
            "source": "OpenStreetMap via Overpass API",
        },
    }

    _write_cache(cache_key, result)
    return result


# ═════════════════════════════════════════════════════════════════════════════
# Road Capacity & Bottleneck Analysis
# ═════════════════════════════════════════════════════════════════════════════


def _segment_length_m(coords: list[list[float]]) -> float:
    """Calculate approximate length of a LineString in meters using Haversine."""
    total = 0.0
    for i in range(len(coords) - 1):
        lon1, lat1 = coords[i]
        lon2, lat2 = coords[i + 1]
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = (
            math.sin(dlat / 2) ** 2
            + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
        )
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        total += 6371000 * c
    return round(total, 1)


@router.get("/{venue_id}/bottlenecks")
async def venue_bottlenecks(
    venue_id: str,
    radius: Annotated[int, Query(ge=500, le=5000)] = 1500,
    crowd_size: Annotated[int, Query(ge=1000, le=100000, description="Expected crowd size")] = 10000,
    egress_minutes: Annotated[int, Query(ge=5, le=60, description="Target egress time (min)")] = 15,
) -> dict:
    """
    Identify road segments that are bottlenecks for pedestrian evacuation.

    Methodology:
    - For each road segment, calculate: pedestrian flow capacity (people/min) x width
    - Given expected crowd_size and egress_minutes, compute required flow rate
    - Flag segments where capacity < required flow = bottleneck
    - Score: ratio of actual capacity to required capacity (lower = worse)

    Returns GeoJSON FeatureCollection with bottleneck severity classification.
    """
    # Get road data (uses cache if available)
    road_data = await venue_roads(venue_id, radius=radius)

    # Required total egress flow: how many people need to pass per minute?
    required_flow_ppm = crowd_size / egress_minutes  # people per minute total

    # Estimate number of main egress routes from the road network
    estimated_routes = max(3, len([
        f for f in road_data["features"]
        if f["properties"].get("highway_type") in ("primary", "secondary", "tertiary")
    ]) // 4)
    flow_per_route = required_flow_ppm / max(estimated_routes, 1)

    bottleneck_features: list[dict] = []
    stats = {
        "critical": 0,
        "warning": 0,
        "adequate": 0,
        "total_segments": 0,
        "avg_capacity_ppm": 0,
        "min_capacity_ppm": float("inf"),
        "narrowest_segment": "",
    }

    total_cap = 0

    for feature in road_data["features"]:
        props = feature["properties"]
        coords = feature["geometry"]["coordinates"]

        ped_cap = props.get("ped_capacity_ppm", 0)
        width_m = props.get("width_m", 2.0)
        highway_type = props.get("highway_type", "residential")
        name = props.get("name", "unnamed")
        seg_length = _segment_length_m(coords)

        # Skip very short segments (< 10m)
        if seg_length < 10:
            continue

        # Bottleneck score: capacity vs required flow per route
        capacity_ratio = ped_cap / flow_per_route if flow_per_route > 0 else 999

        # Classification
        if capacity_ratio < 0.3:
            severity = "critical"
            color = "#ef4444"
            stats["critical"] += 1
        elif capacity_ratio < 0.7:
            severity = "warning"
            color = "#f97316"
            stats["warning"] += 1
        else:
            severity = "adequate"
            color = "#22c55e"
            stats["adequate"] += 1

        stats["total_segments"] += 1
        total_cap += ped_cap

        if ped_cap < stats["min_capacity_ppm"]:
            stats["min_capacity_ppm"] = ped_cap
            stats["narrowest_segment"] = name or f"OSM {props.get('osm_id', '?')}"

        bottleneck_features.append({
            "type": "Feature",
            "properties": {
                "osm_id": props.get("osm_id"),
                "name": name,
                "highway_type": highway_type,
                "width_m": width_m,
                "lanes": props.get("lanes"),
                "ped_capacity_ppm": ped_cap,
                "capacity_rating": props.get("capacity_rating", "unknown"),
                "segment_length_m": seg_length,
                "capacity_ratio": round(capacity_ratio, 2),
                "severity": severity,
                "color": color,
                "is_key_route": highway_type in ("primary", "secondary", "tertiary", "pedestrian"),
                "surface": props.get("surface", ""),
                "lit": props.get("lit", ""),
                "label": f"{name or 'Road'} — {width_m}m wide, {ped_cap}ppl/min",
            },
            "geometry": feature["geometry"],
        })

    if stats["total_segments"] > 0:
        stats["avg_capacity_ppm"] = round(total_cap / stats["total_segments"])
    if stats["min_capacity_ppm"] == float("inf"):
        stats["min_capacity_ppm"] = 0

    # Sort: critical first
    severity_order = {"critical": 0, "warning": 1, "adequate": 2}
    bottleneck_features.sort(key=lambda f: severity_order.get(f["properties"]["severity"], 3))

    return {
        "type": "FeatureCollection",
        "features": bottleneck_features,
        "metadata": {
            "venue_id": venue_id,
            "center": road_data["metadata"]["center"],
            "radius_m": radius,
            "crowd_size": crowd_size,
            "egress_minutes": egress_minutes,
            "required_flow_ppm": round(required_flow_ppm),
            "estimated_routes": estimated_routes,
            "flow_per_route_ppm": round(flow_per_route),
            "total": len(bottleneck_features),
            "stats": stats,
            "source": "CrowdShield analysis on OSM road network",
        },
    }


# ═════════════════════════════════════════════════════════════════════════════
# Isochrone & Routing (OpenRouteService)
# ═════════════════════════════════════════════════════════════════════════════


async def _query_ors(endpoint: str, payload: dict) -> dict:
    """Make a request to OpenRouteService API."""
    async with httpx.AsyncClient(
        timeout=30.0,
        headers={
            "Authorization": ORS_API_KEY,
            "Content-Type": "application/json",
            "User-Agent": "CrowdShield/1.0",
        },
    ) as client:
        try:
            resp = await client.post(f"{ORS_API}/{endpoint}", json=payload)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"ORS API error: {e.response.status_code} — {e.response.text[:200]}")
            raise HTTPException(
                status_code=502,
                detail=f"OpenRouteService returned {e.response.status_code}",
            )
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="OpenRouteService timeout")


@router.get("/{venue_id}/isochrones")
async def venue_isochrones(
    venue_id: str,
    minutes: Annotated[str, Query(description="Comma-separated minutes, e.g. '5,10,15'")] = "5,10,15",
    source: Annotated[str, Query(description="'venue' for from-venue, 'hospitals' for from-hospitals")] = "venue",
) -> dict:
    """
    Generate walking-time isochrone polygons.

    - source='venue': How far can you walk FROM the venue center in N minutes?
    - source='hospitals': How far can you walk FROM each hospital in N minutes?
      (Shows hospital accessibility coverage)

    Returns GeoJSON FeatureCollection with colored polygons.
    """
    lat, lon = _venue_center_or_404(venue_id)

    # Parse minutes
    try:
        ranges_min = [int(m.strip()) for m in minutes.split(",")]
        ranges_sec = [m * 60 for m in ranges_min]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid minutes format")

    # Check cache
    cache_key = _cache_key(venue_id, f"isochrones_{source}_{minutes}", 0)
    cached = _read_cache(cache_key)
    if cached is not None:
        logger.info(f"📦 Spatial: returning cached isochrones for {venue_id}")
        return cached

    # Isochrone colors: green (short) → yellow → red (long)
    COLORS = {
        5: "#22c55e80",   # green, semi-transparent
        10: "#eab30880",  # yellow
        15: "#f9731680",  # orange
        20: "#ef444480",  # red
        30: "#dc262680",  # dark red
    }

    all_features: list[dict] = []

    if source == "hospitals":
        # Get hospital locations first
        fac_result = await venue_facilities(venue_id, radius=5000, types="hospital")
        hospital_coords = []
        hospital_names = []
        for f in fac_result["features"]:
            hospital_coords.append(f["geometry"]["coordinates"])
            hospital_names.append(f["properties"]["name"])

        if not hospital_coords:
            return {
                "type": "FeatureCollection",
                "features": [],
                "metadata": {"venue_id": venue_id, "source": source, "note": "No hospitals found"},
            }

        # ORS supports up to 5 locations per request
        for i, (coords, name) in enumerate(zip(hospital_coords[:5], hospital_names[:5])):
            try:
                ors_result = await _query_ors("isochrones/foot-walking", {
                    "locations": [coords],
                    "range": ranges_sec,
                    "range_type": "time",
                })
                for feat in ors_result.get("features", []):
                    value_sec = feat["properties"]["value"]
                    value_min = int(value_sec / 60)
                    feat["properties"]["source_name"] = name
                    feat["properties"]["source_type"] = "hospital"
                    feat["properties"]["minutes"] = value_min
                    feat["properties"]["color"] = COLORS.get(value_min, "#6366f180")
                    feat["properties"]["label"] = f"{name} — {value_min}min walk"
                    all_features.append(feat)
            except Exception as e:
                logger.warning(f"ORS isochrone failed for {name}: {e}")

    else:  # source == "venue"
        logger.info(f"🗺️ Spatial: computing isochrones from {venue_id} center")
        ors_result = await _query_ors("isochrones/foot-walking", {
            "locations": [[lon, lat]],
            "range": ranges_sec,
            "range_type": "time",
        })
        for feat in ors_result.get("features", []):
            value_sec = feat["properties"]["value"]
            value_min = int(value_sec / 60)
            feat["properties"]["source_name"] = "Event Center"
            feat["properties"]["source_type"] = "venue"
            feat["properties"]["minutes"] = value_min
            feat["properties"]["color"] = COLORS.get(value_min, "#6366f180")
            feat["properties"]["label"] = f"{value_min}min walking radius"
            all_features.append(feat)

    result = {
        "type": "FeatureCollection",
        "features": all_features,
        "metadata": {
            "venue_id": venue_id,
            "source": source,
            "minutes": ranges_min,
            "total": len(all_features),
            "engine": "OpenRouteService foot-walking",
        },
    }

    _write_cache(cache_key, result)
    return result


@router.get("/{venue_id}/route")
async def venue_route(
    venue_id: str,
    from_lon: float = Query(..., description="Origin longitude"),
    from_lat: float = Query(..., description="Origin latitude"),
    to_lon: float = Query(..., description="Destination longitude"),
    to_lat: float = Query(..., description="Destination latitude"),
) -> dict:
    """
    Calculate a pedestrian walking route between two points.

    Returns GeoJSON with route geometry, distance (km), and duration (minutes).
    """
    _venue_center_or_404(venue_id)  # validate venue exists

    logger.info(f"🚶 Spatial: computing route for {venue_id}")
    ors_result = await _query_ors("directions/foot-walking/geojson", {
        "coordinates": [[from_lon, from_lat], [to_lon, to_lat]],
    })

    # Enrich features with readable properties
    for feat in ors_result.get("features", []):
        summary = feat.get("properties", {}).get("summary", {})
        feat["properties"]["distance_km"] = round(summary.get("distance", 0) / 1000, 2)
        feat["properties"]["duration_min"] = round(summary.get("duration", 0) / 60, 1)

    return ors_result

