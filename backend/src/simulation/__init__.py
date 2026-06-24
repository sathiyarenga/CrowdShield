"""
Route-Based Crowd Simulation Engine — v2 (Planning Tool).

Agents walk along real streets via ORS pedestrian routing.
Supports:
  - Auto-detected transport hubs (train stations, bus stops, parking) as origins
  - Custom planner-defined origins/destinations with crowd shares
  - Time-phased arrivals (wave-based)
  - Road closures via ORS avoid_polygons
  - Strict road-following (no lateral noise, no off-road agents)

Output: Trajectory data as timestamped positions for deck.gl TripLayer.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import random
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import httpx
import numpy as np

logger = logging.getLogger(__name__)

# ═════════════════════════════════════════════════════════════════════════════
# Configuration
# ═════════════════════════════════════════════════════════════════════════════

ORS_API = "https://api.openrouteservice.org/v2"
ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjU2NTRiMGFlYTUwZTQ3NGVhOGE3ZjBmZDgyODA5MDQzIiwiaCI6Im11cm11cjY0In0="
OVERPASS_API = "https://overpass-api.de/api/interpreter"
CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / "sim_cache"

# Galway parade route spectator viewpoints — agents walk TO these spots to watch the parade
GALWAY_SPECTATOR_VIEWPOINTS = [
    {"lat": 53.2745, "lon": -9.0490, "name": "Eyre Square Viewing", "share": 0.20},
    {"lat": 53.2739, "lon": -9.0513, "name": "Williamsgate St Viewing", "share": 0.12},
    {"lat": 53.2727, "lon": -9.0527, "name": "Shop Street Viewing", "share": 0.18},
    {"lat": 53.2719, "lon": -9.0539, "name": "Mainguard St Viewing", "share": 0.12},
    {"lat": 53.2718, "lon": -9.0545, "name": "Cross St Junction Viewing", "share": 0.10},
    {"lat": 53.2717, "lon": -9.0558, "name": "Bridge Street Viewing", "share": 0.08},
    {"lat": 53.2715, "lon": -9.0568, "name": "Dominick St Viewing", "share": 0.10},
    {"lat": 53.2701, "lon": -9.0576, "name": "Raven Terrace Viewing", "share": 0.10},
]


@dataclass
class Origin:
    """An ingress/egress point with crowd share and timing."""
    lat: float
    lon: float
    name: str = ""
    hub_type: str = "custom"          # train_station, bus_stop, parking, walking, custom
    crowd_share: float = 0.0          # Fraction of total crowd (0-1)
    arrival_offset_min: float = 0.0   # Minutes before event that arrivals start
    arrival_spread_min: float = 30.0  # Duration over which arrivals are spread


@dataclass
class SimConfig:
    """Simulation configuration."""
    num_agents: int = 2000
    total_time: float = 300.0
    desired_speed: float = 1.2
    speed_std: float = 0.25
    scenario: Literal["ingress", "egress", "bidirectional"] = "ingress"
    domain_radius: float = 400.0

    # Custom origins/destinations (if empty, auto-detect from OSM)
    origins: list[Origin] = field(default_factory=list)
    destinations: list[Origin] = field(default_factory=list)

    # Road closures (GeoJSON polygons to avoid)
    avoid_polygons: list[dict] | None = None


@dataclass
class SimResult:
    """Simulation output."""
    trajectories: list[dict]
    stats: dict
    config: dict
    origins_used: list[dict]


# ═════════════════════════════════════════════════════════════════════════════
# OSM Transport Hub Detection
# ═════════════════════════════════════════════════════════════════════════════

HUB_QUERIES = {
    "train_station": {
        "osm_tags": '["railway"~"station|halt"]',
        "icon": "🚉",
        "default_share": 0.35,
        "default_offset": 60,
    },
    "bus_stop": {
        "osm_tags": '["highway"="bus_stop"]',
        "icon": "🚌",
        "default_share": 0.04,  # per stop, capped total
        "default_offset": 45,
    },
    "bus_station": {
        "osm_tags": '["amenity"="bus_station"]',
        "icon": "🚏",
        "default_share": 0.20,
        "default_offset": 45,
    },
    "parking": {
        "osm_tags": '["amenity"="parking"]["parking"!="underground"]',
        "icon": "🅿️",
        "default_share": 0.05,
        "default_offset": 30,
    },
}


def _detect_transport_hubs(
    center_lat: float, center_lon: float, radius_m: int = 1200,
) -> list[Origin]:
    """
    Auto-detect transport hubs from OSM via Overpass API.
    Applies smart filtering: limits bus stops, only named parking, etc.
    Returns a list of Origin objects with default crowd shares.
    """
    cache_key = hashlib.md5(f"hubs_v2_{center_lat}_{center_lon}_{radius_m}".encode()).hexdigest()
    cache_file = CACHE_DIR / f"{cache_key}.json"

    if cache_file.exists():
        try:
            with open(cache_file) as f:
                cached = json.load(f)
            origins = [Origin(**o) for o in cached]
            if origins:
                return origins
        except Exception:
            pass

    all_hubs: dict[str, list[Origin]] = {}

    for hub_type, cfg in HUB_QUERIES.items():
        query = f"""
[out:json][timeout:15];
(
  node{cfg["osm_tags"]}(around:{radius_m},{center_lat},{center_lon});
  way{cfg["osm_tags"]}(around:{radius_m},{center_lat},{center_lon});
);
out center;
"""
        try:
            with httpx.Client(
                timeout=20.0,
                headers={"User-Agent": "CrowdShield/1.0"},
            ) as client:
                resp = client.post(OVERPASS_API, data={"data": query})
                if resp.status_code != 200:
                    continue
                data = resp.json()

            hubs_of_type = []
            for el in data.get("elements", []):
                lat = el.get("lat") or el.get("center", {}).get("lat")
                lon = el.get("lon") or el.get("center", {}).get("lon")
                if not lat or not lon:
                    continue

                tags = el.get("tags", {})
                name = tags.get("name", "")

                # Skip unnamed parking lots
                if hub_type == "parking" and not name:
                    continue

                if not name:
                    name = f"{hub_type}_{el.get('id', '')}"

                hubs_of_type.append(Origin(
                    lat=lat,
                    lon=lon,
                    name=name,
                    hub_type=hub_type,
                    crowd_share=cfg["default_share"],
                    arrival_offset_min=cfg["default_offset"],
                    arrival_spread_min=30.0,
                ))

            all_hubs[hub_type] = hubs_of_type
            logger.info(f"  {hub_type}: found {len(hubs_of_type)} hubs")

        except Exception as e:
            logger.warning(f"Hub detection failed for {hub_type}: {e}")

        time.sleep(0.3)

    # Smart selection: limit counts per type, sort by distance to center
    def _dist_to_center(o: Origin) -> float:
        return math.sqrt((o.lat - center_lat)**2 + (o.lon - center_lon)**2)

    MAX_PER_TYPE = {
        "train_station": 5,
        "bus_stop": 6,
        "bus_station": 3,
        "parking": 5,
    }

    # Target crowd shares by transport type
    TYPE_SHARES = {
        "train_station": 0.40,  # Trains bring the most people
        "bus_station": 0.20,
        "bus_stop": 0.20,       # Split across stops
        "parking": 0.15,
        # Remaining 0.05 is "walking" fallback
    }

    origins: list[Origin] = []
    for hub_type, hubs in all_hubs.items():
        # Sort by distance (closest first)
        hubs.sort(key=_dist_to_center)
        max_count = MAX_PER_TYPE.get(hub_type, 5)
        selected = hubs[:max_count]

        # Distribute the type's share evenly among selected hubs
        type_share = TYPE_SHARES.get(hub_type, 0.1)
        per_hub_share = type_share / len(selected) if selected else 0
        for h in selected:
            h.crowd_share = round(per_hub_share, 3)
        origins.extend(selected)

    # Add a "walking" fallback origin if we have few hubs
    if len(origins) < 3:
        for i in range(4):
            angle = math.pi / 2 * i
            r = min(radius_m, 600)
            olat = center_lat + (r * math.sin(angle)) / 111320.0
            olon = center_lon + (r * math.cos(angle)) / (111320.0 * math.cos(math.radians(center_lat)))
            origins.append(Origin(
                lat=olat, lon=olon, name=f"Walk-in Entry {i+1}",
                hub_type="walking", crowd_share=0.25,
                arrival_offset_min=30, arrival_spread_min=45,
            ))

    # Normalize shares to sum to 1.0
    if origins:
        total_share = sum(o.crowd_share for o in origins)
        if total_share > 0:
            for o in origins:
                o.crowd_share = round(o.crowd_share / total_share, 3)

    # Cache results
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with open(cache_file, "w") as f:
        json.dump([{
            "lat": o.lat, "lon": o.lon, "name": o.name,
            "hub_type": o.hub_type, "crowd_share": o.crowd_share,
            "arrival_offset_min": o.arrival_offset_min,
            "arrival_spread_min": o.arrival_spread_min,
        } for o in origins], f, indent=2)

    logger.info(f"🚉 Detected {len(origins)} transport hubs")
    return origins


# ═════════════════════════════════════════════════════════════════════════════
# ORS Route Computation
# ═════════════════════════════════════════════════════════════════════════════


def _compute_ors_route(
    from_lat: float, from_lon: float,
    to_lat: float, to_lon: float,
    avoid_polygons: list[dict] | None = None,
) -> list[list[float]] | None:
    """Compute pedestrian walking route via ORS. Returns [[lon, lat], ...]."""
    try:
        body: dict = {"coordinates": [[from_lon, from_lat], [to_lon, to_lat]]}
        if avoid_polygons:
            body["options"] = {
                "avoid_polygons": {
                    "type": "MultiPolygon",
                    "coordinates": [p["coordinates"] for p in avoid_polygons
                                    if p.get("type") == "Polygon"],
                }
            }

        with httpx.Client(
            timeout=15.0,
            headers={
                "Authorization": ORS_API_KEY,
                "Content-Type": "application/json",
                "User-Agent": "CrowdShield/1.0",
            },
        ) as client:
            resp = client.post(f"{ORS_API}/directions/foot-walking/geojson", json=body)
            if resp.status_code != 200:
                logger.warning(f"ORS route failed: {resp.status_code} {resp.text[:200]}")
                return None
            data = resp.json()
            features = data.get("features", [])
            if not features:
                return None
            return features[0]["geometry"]["coordinates"]
    except Exception as e:
        logger.warning(f"ORS route error: {e}")
        return None


def _compute_routes_for_origins(
    origins: list[Origin],
    center_lat: float, center_lon: float,
    scenario: str,
    avoid_polygons: list[dict] | None = None,
) -> list[tuple[Origin, list[list[float]]]]:
    """Compute ORS routes for all origins. Returns (origin, route_coords) pairs."""
    cache_key = hashlib.md5(
        f"routes_{center_lat}_{center_lon}_{scenario}_{len(origins)}"
        f"_{sum(hash((o.lat, o.lon)) for o in origins)}"
        f"_{hash(json.dumps(avoid_polygons, sort_keys=True) if avoid_polygons else '')}".encode()
    ).hexdigest()
    cache_file = CACHE_DIR / f"routes_{cache_key}.json"

    # Try cache
    if cache_file.exists():
        try:
            with open(cache_file) as f:
                cached = json.load(f)
            result = []
            for item in cached:
                origin = Origin(**item["origin"])
                result.append((origin, item["coords"]))
            logger.info(f"📦 Loaded {len(result)} cached routes")
            return result
        except Exception:
            pass

    results = []
    for i, origin in enumerate(origins):
        if scenario == "egress":
            coords = _compute_ors_route(
                center_lat, center_lon, origin.lat, origin.lon, avoid_polygons
            )
        else:
            coords = _compute_ors_route(
                origin.lat, origin.lon, center_lat, center_lon, avoid_polygons
            )

        if coords and len(coords) >= 2:
            results.append((origin, coords))
            logger.info(f"  Route {i+1}/{len(origins)}: {origin.name} → {len(coords)} pts")
        else:
            logger.warning(f"  Route {i+1}/{len(origins)}: {origin.name} FAILED")

        if i < len(origins) - 1:
            time.sleep(0.35)  # ORS rate limit

    # Cache
    if results:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        with open(cache_file, "w") as f:
            json.dump([{
                "origin": {
                    "lat": o.lat, "lon": o.lon, "name": o.name,
                    "hub_type": o.hub_type, "crowd_share": o.crowd_share,
                    "arrival_offset_min": o.arrival_offset_min,
                    "arrival_spread_min": o.arrival_spread_min,
                },
                "coords": c,
            } for o, c in results], f)
        logger.info(f"💾 Cached {len(results)} routes")

    return results


# ═════════════════════════════════════════════════════════════════════════════
# Route Interpolation (strict road-following, NO lateral noise)
# ═════════════════════════════════════════════════════════════════════════════


def _interpolate_along_route(
    coords: list[list[float]],
    speed: float,
    start_time: float,
    sample_interval: float = 2.0,
    max_time: float = 600.0,
) -> list[list[float]]:
    """
    Generate timestamped positions strictly along a route.
    Returns [[lon, lat, timestamp], ...] for deck.gl TripLayer.
    NO lateral noise — agents stay on the road centerline.
    """
    if len(coords) < 2:
        return []

    # Compute cumulative distances
    cum_dist = [0.0]
    for i in range(1, len(coords)):
        lon1, lat1 = coords[i-1]
        lon2, lat2 = coords[i]
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = (math.sin(dlat/2)**2 +
             math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
             math.sin(dlon/2)**2)
        seg = 6371000 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        cum_dist.append(cum_dist[-1] + seg)

    total_dist = cum_dist[-1]
    if total_dist < 1:
        return []

    travel_time = total_dist / speed
    path = []
    t = 0.0

    while t <= travel_time:
        if start_time + t > max_time:
            break

        d = t * speed
        # Binary search for segment
        lo, hi = 0, len(cum_dist) - 2
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if cum_dist[mid] <= d:
                lo = mid
            else:
                hi = mid - 1
        seg_idx = lo

        seg_len = cum_dist[seg_idx + 1] - cum_dist[seg_idx]
        frac = (d - cum_dist[seg_idx]) / seg_len if seg_len > 0.01 else 0.0
        frac = max(0.0, min(1.0, frac))

        lon = coords[seg_idx][0] + frac * (coords[seg_idx + 1][0] - coords[seg_idx][0])
        lat = coords[seg_idx][1] + frac * (coords[seg_idx + 1][1] - coords[seg_idx][1])

        path.append([round(lon, 6), round(lat, 6), round(start_time + t, 0)])
        t += sample_interval

    return path


# ═════════════════════════════════════════════════════════════════════════════
# Main Simulation
# ═════════════════════════════════════════════════════════════════════════════


def run_simulation(config: SimConfig, center_latlon: tuple[float, float]) -> SimResult:
    """Run route-based crowd simulation with transport hub origins."""
    t_start = time.time()
    rng = random.Random(42)

    n = config.num_agents
    lat_center, lon_center = center_latlon
    logger.info(f"🏃 Sim v2: {n} agents, {config.scenario}, {config.total_time}s")

    # 1. Determine origins
    if config.origins:
        origins = config.origins
        logger.info(f"🏃 Sim: using {len(origins)} custom origins")
    else:
        # Auto-detect transport hubs
        origins = _detect_transport_hubs(lat_center, lon_center, int(config.domain_radius * 3))
        if not origins:
            # Fallback: generate perimeter points on roads
            logger.warning("No transport hubs found — using perimeter fallback")
            for i in range(8):
                angle = (2 * math.pi * i) / 8
                r = config.domain_radius
                olat = lat_center + (r * math.sin(angle)) / 111320.0
                olon = lon_center + (r * math.cos(angle)) / (111320.0 * math.cos(math.radians(lat_center)))
                origins.append(Origin(
                    lat=olat, lon=olon, name=f"Entry {i+1}",
                    hub_type="walking", crowd_share=1.0/8,
                    arrival_offset_min=30, arrival_spread_min=30,
                ))
        logger.info(f"🚉 Auto-detected {len(origins)} origins:")
        for o in origins:
            logger.info(f"   {o.hub_type}: {o.name} ({o.crowd_share*100:.0f}%)")

    # 2. Compute ORS routes (cached)
    route_pairs = _compute_routes_for_origins(
        origins, lat_center, lon_center, config.scenario, config.avoid_polygons
    )

    if not route_pairs:
        return SimResult(
            trajectories=[], stats={"error": "No routes computed"},
            config={"num_agents": n}, origins_used=[],
        )

    # 3. Distribute agents across routes based on crowd_share
    # Render free tier has 512MB RAM — cap at 3000 agents in deployed mode
    import os
    deploy_cap = int(os.environ.get("SIM_AGENT_CAP", "3000"))
    max_viz = min(n, deploy_cap) if os.environ.get("RENDER") else n
    sample_interval = 1.0 if max_viz <= 5000 else 1.5 if max_viz <= 15000 else 2.0

    trips = []
    route_lengths = []

    # For parade events (Galway), distribute agents to spectator viewpoints along the route
    is_parade = (venue_id == "galway") if hasattr(config, '_venue_id') else (abs(lat_center - 53.2707) < 0.01)

    if is_parade and GALWAY_SPECTATOR_VIEWPOINTS:
        # Compute routes from each origin to each viewpoint
        parade_route_pairs: list[tuple[Origin, list[list[float]], dict]] = []
        for origin, route_to_center in route_pairs:
            for vp in GALWAY_SPECTATOR_VIEWPOINTS:
                # Try to get a route from origin to this viewpoint
                cache_key_vp = hashlib.md5(
                    f"vp_{origin.lat}_{origin.lon}_{vp['lat']}_{vp['lon']}_{config.scenario}".encode()
                ).hexdigest()
                cache_file_vp = CACHE_DIR / f"vproute_{cache_key_vp}.json"

                coords = None
                if cache_file_vp.exists():
                    try:
                        with open(cache_file_vp) as f:
                            coords = json.load(f)
                    except Exception:
                        pass

                if coords is None:
                    if config.scenario == "egress":
                        coords = _compute_ors_route(vp["lat"], vp["lon"], origin.lat, origin.lon, config.avoid_polygons)
                    else:
                        coords = _compute_ors_route(origin.lat, origin.lon, vp["lat"], vp["lon"], config.avoid_polygons)

                    if coords and len(coords) >= 2:
                        CACHE_DIR.mkdir(parents=True, exist_ok=True)
                        with open(cache_file_vp, "w") as f:
                            json.dump(coords, f)
                        time.sleep(0.35)  # ORS rate limit

                if coords and len(coords) >= 2:
                    parade_route_pairs.append((origin, coords, vp))

        logger.info(f"🎭 Parade mode: {len(parade_route_pairs)} origin→viewpoint routes")

        # Distribute agents: each viewpoint gets its share of agents
        for origin, coords, vp in parade_route_pairs:
            route_len = 0
            for i in range(1, len(coords)):
                dlat = math.radians(coords[i][1] - coords[i-1][1])
                dlon = math.radians(coords[i][0] - coords[i-1][0])
                a = (math.sin(dlat/2)**2 +
                     math.cos(math.radians(coords[i-1][1])) *
                     math.cos(math.radians(coords[i][1])) *
                     math.sin(dlon/2)**2)
                route_len += 6371000 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            route_lengths.append(route_len)

            # How many agents: origin's share × viewpoint's share × total agents
            n_agents = max(1, int(max_viz * origin.crowd_share * vp["share"]))

            for j in range(n_agents):
                if len(trips) >= max_viz:
                    break

                arrival_start = max(0, config.total_time * 0.03)
                arrival_window = min(origin.arrival_spread_min * 60, config.total_time * 0.6)
                start_time = rng.uniform(arrival_start, arrival_start + arrival_window)
                speed = max(0.5, min(2.0, rng.gauss(config.desired_speed, config.speed_std)))

                path = _interpolate_along_route(
                    coords, speed, start_time, sample_interval, config.total_time
                )

                if len(path) < 3:
                    continue

                # Accumulation: after arriving, agent stays at viewpoint
                if path:
                    last_point = path[-1]
                    arrival_time = last_point[2]
                    dwell_interval = sample_interval * 2
                    dwell_t = arrival_time + dwell_interval
                    while dwell_t <= config.total_time:
                        path.append([last_point[0], last_point[1], round(dwell_t, 0)])
                        dwell_t += dwell_interval

                trips.append({
                    "path": path,
                    "speed": round(speed, 2),
                    "agent_id": len(trips),
                    "origin": origin.name,
                    "hub_type": origin.hub_type,
                })

            if len(trips) >= max_viz:
                break
    else:
        # Standard single-destination simulation (stadiums, etc.)
        for origin, coords in route_pairs:
            route_len = 0
            for i in range(1, len(coords)):
                dlat = math.radians(coords[i][1] - coords[i-1][1])
                dlon = math.radians(coords[i][0] - coords[i-1][0])
                a = (math.sin(dlat/2)**2 +
                     math.cos(math.radians(coords[i-1][1])) *
                     math.cos(math.radians(coords[i][1])) *
                     math.sin(dlon/2)**2)
                route_len += 6371000 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            route_lengths.append(route_len)

            n_agents = max(1, int(max_viz * origin.crowd_share))

            for j in range(n_agents):
                if len(trips) >= max_viz:
                    break

                arrival_start = max(0, config.total_time * 0.03)
                arrival_window = min(origin.arrival_spread_min * 60, config.total_time * 0.6)
                start_time = rng.uniform(arrival_start, arrival_start + arrival_window)
                speed = max(0.5, min(2.0, rng.gauss(config.desired_speed, config.speed_std)))

                path = _interpolate_along_route(
                    coords, speed, start_time, sample_interval, config.total_time
                )

                if len(path) < 3:
                    continue

                if path:
                    last_point = path[-1]
                    arrival_time = last_point[2]
                    dwell_interval = sample_interval * 2
                    dwell_t = arrival_time + dwell_interval
                    while dwell_t <= config.total_time:
                        path.append([last_point[0], last_point[1], round(dwell_t, 0)])
                        dwell_t += dwell_interval

                trips.append({
                    "path": path,
                    "speed": round(speed, 2),
                    "agent_id": len(trips),
                    "origin": origin.name,
                    "hub_type": origin.hub_type,
                })

            if len(trips) >= max_viz:
                break

    t_elapsed = time.time() - t_start
    avg_len = sum(route_lengths) / len(route_lengths) if route_lengths else 0

    # Count agents that completed their route (arrived at destination)
    agents_arrived = 0
    for trip in trips:
        p = trip["path"]
        if len(p) >= 2 and p[-1][2] > p[-2][2]:
            # Has dwell points → arrived
            agents_arrived += 1

    logger.info(f"🏃 Sim v2: done in {t_elapsed:.1f}s — {len(trips)} trips, {len(route_pairs)} routes")

    # Determine destination description
    if config.scenario == "egress":
        dest_desc = "Dispersal points (exits)"
    else:
        dest_desc = "Event venue (center)"

    return SimResult(
        trajectories=trips,
        stats={
            "num_agents": n,
            "agents_visualized": len(trips),
            "viz_cap": max_viz,
            "total_routes": len(route_pairs),
            "total_frames": max(len(t["path"]) for t in trips) if trips else 0,
            "simulation_time_s": config.total_time,
            "wall_time_s": round(t_elapsed, 2),
            "avg_route_length_m": round(avg_len, 0),
            "avg_walk_time_min": round(avg_len / (config.desired_speed * 60), 1) if avg_len > 0 else 0,
            "agents_arrived": agents_arrived,
            "scenario": config.scenario,
            "mode": "route-based (ORS + OSM transport hubs)",
        },
        config={
            "num_agents": n,
            "total_time": config.total_time,
            "scenario": config.scenario,
            "desired_speed": config.desired_speed,
            "domain_radius": config.domain_radius,
        },
        origins_used=[{
            "name": o.name,
            "hub_type": o.hub_type,
            "lat": o.lat,
            "lon": o.lon,
            "crowd_share": o.crowd_share,
            "agents_assigned": sum(1 for t in trips if t.get("origin") == o.name),
        } for o, _ in route_pairs],
    )

