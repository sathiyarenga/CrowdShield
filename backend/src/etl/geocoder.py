"""Batch geocoder for Fredrikstad area names.

Uses OpenStreetMap Nominatim to convert area names to lat/lon coordinates.
Results are cached to `backend/data/fredrikstad_geocache.json` so this
only needs to run once.

Usage:
    python -m src.etl.geocoder
"""

from __future__ import annotations

import json
import logging
import re
import time
from pathlib import Path
from urllib.parse import quote_plus
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

CACHE_FILE = Path(__file__).resolve().parents[2] / "data" / "fredrikstad_geocache.json"

# Fredrikstad center fallback
FREDRIKSTAD_CENTER = (59.2181, 10.9298)


def _strip_zone_suffix(name: str) -> str:
    """Remove numbered sub-zone suffixes like '(1)', '(2)' from area names."""
    return re.sub(r"\s*\(\d+\)\s*$", "", name).strip()


def _geocode_nominatim(query: str) -> tuple[float, float] | None:
    """Geocode a single query via Nominatim. Returns (lat, lon) or None."""
    import ssl
    url = (
        f"https://nominatim.openstreetmap.org/search?"
        f"q={quote_plus(query)}&format=json&limit=1&countrycodes=no"
    )
    req = Request(url, headers={"User-Agent": "CrowdShield/1.0 (research project)"})
    try:
        # Try with certifi first, fall back to unverified
        ctx = ssl.create_default_context()
        try:
            import certifi
            ctx.load_verify_locations(certifi.where())
        except (ImportError, Exception):
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        with urlopen(req, timeout=10, context=ctx) as resp:
            data = json.loads(resp.read())
            if data:
                return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as e:
        logger.warning("Geocode failed for %r: %s", query, e)
    return None


def geocode_areas(areas: list[dict], delay: float = 1.1) -> dict[str, dict]:
    """Geocode a list of areas with caching.

    Args:
        areas: List of dicts with 'name' and 'code' keys.
        delay: Seconds between Nominatim requests (must be ≥1 for ToS).

    Returns:
        Dict mapping area_code → {name, lat, lon, source}.
    """
    # Load existing cache
    cache: dict[str, dict] = {}
    if CACHE_FILE.exists():
        with open(CACHE_FILE) as f:
            cache = json.load(f)
        logger.info("Loaded %d cached geocodes from %s", len(cache), CACHE_FILE)

    # Deduplicate by stripping zone suffixes
    seen_base_names: dict[str, tuple[float, float]] = {}
    to_geocode: list[dict] = []

    for area in areas:
        code = area["code"]
        if code in cache:
            continue
        base_name = _strip_zone_suffix(area["name"])
        if base_name in seen_base_names:
            # Reuse coordinates from same base name with small offset
            lat, lon = seen_base_names[base_name]
            import random
            offset_lat = random.uniform(-0.001, 0.001)
            offset_lon = random.uniform(-0.001, 0.001)
            cache[code] = {
                "name": area["name"],
                "lat": round(lat + offset_lat, 6),
                "lon": round(lon + offset_lon, 6),
                "source": "clone",
            }
        else:
            to_geocode.append(area)

    if not to_geocode:
        logger.info("All %d areas already geocoded", len(areas))
        return cache

    logger.info("Geocoding %d new areas (of %d total)...", len(to_geocode), len(areas))
    success = 0
    failed_names: list[str] = []

    for i, area in enumerate(to_geocode):
        base_name = _strip_zone_suffix(area["name"])
        code = area["code"]

        # Try specific search first
        result = _geocode_nominatim(f"{base_name}, Fredrikstad, Norway")

        # Broader search if specific fails
        if result is None:
            result = _geocode_nominatim(f"{base_name}, Østfold, Norway")

        if result:
            lat, lon = result
            cache[code] = {
                "name": area["name"],
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "source": "nominatim",
            }
            seen_base_names[base_name] = (lat, lon)
            success += 1
        else:
            # Place near Fredrikstad center with offset
            import random
            cache[code] = {
                "name": area["name"],
                "lat": round(FREDRIKSTAD_CENTER[0] + random.uniform(-0.02, 0.02), 6),
                "lon": round(FREDRIKSTAD_CENTER[1] + random.uniform(-0.02, 0.02), 6),
                "source": "fallback",
            }
            failed_names.append(area["name"])

        if (i + 1) % 10 == 0:
            logger.info("  Geocoded %d/%d...", i + 1, len(to_geocode))

        # Nominatim rate limit: max 1 request per second
        time.sleep(delay)

    # Save cache
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)

    logger.info(
        "Geocoding complete: %d success, %d fallback, %d total cached. Saved to %s",
        success, len(failed_names), len(cache), CACHE_FILE,
    )
    if failed_names:
        logger.warning("Failed to geocode: %s", failed_names[:20])

    return cache


def load_geocache() -> dict[str, dict]:
    """Load the geocache file. Returns empty dict if not found."""
    if CACHE_FILE.exists():
        with open(CACHE_FILE) as f:
            return json.load(f)
    return {}


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    # Load areas from the data store
    from src.etl.telia_loader import load_all
    from src.etl.data_store import store

    load_all()
    areas_df = store.telia_areas
    if areas_df.empty:
        print("No Telia area data loaded!")
        sys.exit(1)

    areas = [
        {"name": row["area_name"], "code": str(row["area_code"])}
        for _, row in areas_df.iterrows()
    ]
    print(f"Found {len(areas)} areas to geocode")
    result = geocode_areas(areas)
    print(f"Done! {len(result)} areas in cache")
