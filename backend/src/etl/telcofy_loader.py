"""Telcofy Ullevaal Stadion ETL — loads summary, breakdown, and area CSVs.

Data layout
───────────
Telcofy/
  Ullevaal_Stadion_summary.csv    → batch_data, timestamp, area_name, people
  Ullevaal_Stadion_breakdown.csv  → batch_data, timestamp, area_name, people, country
  Ullevaal_Stadion_areas.csv      → id, area_name, polygon_wkt

Event dates observed: 2025-09-03, 2025-09-04, 2025-09-09, 2025-10-11, 2025-10-12
Timestamps are UTC, ~5-minute intervals. CSV uses \\r\\n line endings.

Usage
─────
    python -m src.etl.telcofy_loader              # standalone
    from src.etl.telcofy_loader import load_all   # programmatic
"""

from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from src.etl.data_store import store

logger = logging.getLogger(__name__)

DATA_ROOT = Path(__file__).resolve().parents[3] / "Data" / "Telcofy"


def load_summary(data_root: Path = DATA_ROOT) -> pd.DataFrame:
    """Load the Ullevaal crowd-count summary CSV.

    Returns
    -------
    pd.DataFrame
        Columns: batch_data (date), timestamp (datetime64[ns, UTC]),
                 area_name (str), people (int)
    """
    path = data_root / "Ullevaal_Stadion_summary.csv"
    if not path.exists():
        logger.error("Summary CSV not found: %s", path)
        return pd.DataFrame()

    df = pd.read_csv(path, encoding="utf-8")

    # Parse timestamps
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df["batch_data"] = pd.to_datetime(df["batch_data"]).dt.date
    df["people"] = pd.to_numeric(df["people"], errors="coerce").fillna(0).astype(int)

    # Derived columns for easier querying
    df["hour"] = df["timestamp"].dt.hour
    df["minute"] = df["timestamp"].dt.minute

    logger.info(
        "Loaded summary: %d rows, dates %s, people range %d–%d",
        len(df),
        sorted(df["batch_data"].unique()),
        df["people"].min(),
        df["people"].max(),
    )
    return df


def load_breakdown(data_root: Path = DATA_ROOT) -> pd.DataFrame:
    """Load the nationality breakdown CSV.

    Returns
    -------
    pd.DataFrame
        Columns: batch_data (date), timestamp (datetime64[ns, UTC]),
                 area_name (str), people (int), country (str)
    """
    path = data_root / "Ullevaal_Stadion_breakdown.csv"
    if not path.exists():
        logger.error("Breakdown CSV not found: %s", path)
        return pd.DataFrame()

    df = pd.read_csv(path, encoding="utf-8")
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df["batch_data"] = pd.to_datetime(df["batch_data"]).dt.date
    df["people"] = pd.to_numeric(df["people"], errors="coerce").fillna(0).astype(int)

    logger.info(
        "Loaded breakdown: %d rows, %d countries",
        len(df),
        df["country"].nunique(),
    )
    return df


def load_areas(data_root: Path = DATA_ROOT) -> pd.DataFrame:
    """Load the area geometry CSV and parse WKT polygons with Shapely.

    Returns
    -------
    pd.DataFrame
        Columns: id (str), area_name (str), polygon_wkt (str),
                 geometry (shapely.Polygon)
    """
    path = data_root / "Ullevaal_Stadion_areas.csv"
    if not path.exists():
        logger.error("Areas CSV not found: %s", path)
        return pd.DataFrame()

    df = pd.read_csv(path, encoding="utf-8")
    # Drop empty trailing rows
    df = df.dropna(subset=["id"])

    # Parse WKT to Shapely geometries
    try:
        from shapely import wkt as shapely_wkt

        df["geometry"] = df["polygon_wkt"].apply(shapely_wkt.loads)
        df["area_sqm"] = df["geometry"].apply(
            lambda g: _approx_area_m2(g) if g is not None else None
        )
        df["centroid_lat"] = df["geometry"].apply(lambda g: g.centroid.y)
        df["centroid_lon"] = df["geometry"].apply(lambda g: g.centroid.x)
    except ImportError:
        logger.warning("shapely not installed — geometry column will be missing")
        df["geometry"] = None
        df["area_sqm"] = None
        df["centroid_lat"] = None
        df["centroid_lon"] = None

    logger.info("Loaded %d area polygons", len(df))
    return df


def _approx_area_m2(polygon) -> float:
    """Approximate polygon area in m² from WGS-84 coordinates.

    Uses a simple lat-lon → metres scaling (good enough at 60°N latitude).
    For production, use pyproj transforms.
    """
    import math

    centroid = polygon.centroid
    lat_rad = math.radians(centroid.y)
    # Metres per degree at this latitude
    m_per_deg_lat = 111_132.0
    m_per_deg_lon = 111_132.0 * math.cos(lat_rad)

    coords = list(polygon.exterior.coords)
    # Shoelace formula in metres
    n = len(coords)
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        xi = coords[i][0] * m_per_deg_lon
        yi = coords[i][1] * m_per_deg_lat
        xj = coords[j][0] * m_per_deg_lon
        yj = coords[j][1] * m_per_deg_lat
        area += xi * yj - xj * yi
    return abs(area) / 2.0


def load_all(data_root: Path = DATA_ROOT) -> None:
    """Load all Telcofy data and populate the in-memory store."""
    logger.info("Loading Telcofy data from %s", data_root)

    store.telcofy_summary = load_summary(data_root)
    store.telcofy_breakdown = load_breakdown(data_root)
    store.telcofy_areas = load_areas(data_root)

    _print_summary()


def _print_summary() -> None:
    """Print summary statistics to stdout."""
    print("\n" + "=" * 70)
    print("  TELCOFY ULLEVAAL STADION — Load Summary")
    print("=" * 70)

    if not store.telcofy_summary.empty:
        df = store.telcofy_summary
        print(f"  Summary rows     : {len(df):>8,}")
        dates = sorted(df["batch_data"].unique())
        print(f"  Event dates      : {len(dates)} days")
        for d in dates:
            day_df = df[df["batch_data"] == d]
            print(f"    {d}  → {len(day_df):>4} obs, peak {day_df['people'].max():>6,}")
    else:
        print("  Summary          : (not loaded)")

    if not store.telcofy_breakdown.empty:
        df = store.telcofy_breakdown
        print(f"  Breakdown rows   : {len(df):>8,}")
        print(f"  Countries        : {sorted(df['country'].unique())}")
    else:
        print("  Breakdown        : (not loaded)")

    if not store.telcofy_areas.empty:
        df = store.telcofy_areas
        print(f"  Areas            : {len(df)}")
        for _, row in df.iterrows():
            area_sqm = row.get("area_sqm")
            sqm_str = f"{area_sqm:,.0f} m²" if area_sqm else "N/A"
            print(f"    {row['area_name']:<35s}  {sqm_str}")
    else:
        print("  Areas            : (not loaded)")

    print("=" * 70 + "\n")


# ── Standalone entry point ──────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
    load_all()
