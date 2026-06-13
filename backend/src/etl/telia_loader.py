"""Telia Eventwood ETL — loads 62 BigQuery-export JSON files from Fredrikstad.

Data layout
───────────
data_Eventwood/
  daily_activities/   → 31 files  (2023-07-01 … 2023-07-31)
  hourly_activities/  → 31 files  (same dates, with local_hour field)

Each JSON is a BigQuery getQueryResults response with a `rows` array.
Row schema (daily):  batch_date, area_name, area_code, admin_level_2, people, rating
Row schema (hourly): same + local_hour  (ISO timestamp, hour granularity)

Usage
─────
    python -m src.etl.telia_loader            # standalone
    from src.etl.telia_loader import load_all  # programmatic
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import pandas as pd

from src.etl.data_store import store

logger = logging.getLogger(__name__)

# Default path — override via argument
DATA_ROOT = Path(__file__).resolve().parents[3] / "Data" / "Telia" / "data_Eventwood"


def _parse_bigquery_json(path: Path) -> list[dict]:
    """Extract the row dicts from a BigQuery getQueryResults JSON export.

    The rows live at the top-level ``rows`` key. Each row is already a flat
    dict with string values (people is a string that must be cast to int).
    """
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    rows: list[dict] = payload.get("rows", [])
    if not rows:
        logger.warning("No rows found in %s", path.name)
    return rows


def load_daily(data_root: Path = DATA_ROOT) -> pd.DataFrame:
    """Load all daily activity files into a single DataFrame.

    Returns
    -------
    pd.DataFrame
        Columns: batch_date, area_name, area_code, admin_level_2, people, rating
    """
    daily_dir = data_root / "daily_activities"
    if not daily_dir.exists():
        logger.error("Daily activities directory not found: %s", daily_dir)
        return pd.DataFrame()

    all_rows: list[dict] = []
    for json_file in sorted(daily_dir.glob("*.json")):
        all_rows.extend(_parse_bigquery_json(json_file))

    if not all_rows:
        return pd.DataFrame()

    df = pd.DataFrame(all_rows)
    df["people"] = pd.to_numeric(df["people"], errors="coerce").fillna(0).astype(int)
    df["batch_date"] = pd.to_datetime(df["batch_date"]).dt.date
    logger.info(
        "Loaded %d daily rows across %d files, %d areas",
        len(df),
        len(list(daily_dir.glob("*.json"))),
        df["area_code"].nunique(),
    )
    return df


def load_hourly(data_root: Path = DATA_ROOT) -> pd.DataFrame:
    """Load all hourly activity files into a single DataFrame.

    Returns
    -------
    pd.DataFrame
        Columns: batch_date, area_name, area_code, admin_level_2,
                 local_hour, people, rating
    """
    hourly_dir = data_root / "hourly_activities"
    if not hourly_dir.exists():
        logger.error("Hourly activities directory not found: %s", hourly_dir)
        return pd.DataFrame()

    all_rows: list[dict] = []
    for json_file in sorted(hourly_dir.glob("*.json")):
        all_rows.extend(_parse_bigquery_json(json_file))

    if not all_rows:
        return pd.DataFrame()

    df = pd.DataFrame(all_rows)
    df["people"] = pd.to_numeric(df["people"], errors="coerce").fillna(0).astype(int)
    df["batch_date"] = pd.to_datetime(df["batch_date"]).dt.date
    df["local_hour"] = pd.to_datetime(df["local_hour"])
    df["hour"] = df["local_hour"].dt.hour
    logger.info(
        "Loaded %d hourly rows across %d files, %d areas, hours %d–%d",
        len(df),
        len(list(hourly_dir.glob("*.json"))),
        df["area_code"].nunique(),
        df["hour"].min(),
        df["hour"].max(),
    )
    return df


def build_area_metadata(daily_df: pd.DataFrame, hourly_df: pd.DataFrame) -> pd.DataFrame:
    """Extract distinct area metadata with aggregate statistics.

    Returns
    -------
    pd.DataFrame
        Columns: area_code, area_name, admin_level_2,
                 daily_mean_people, daily_max_people, days_observed
    """
    if daily_df.empty:
        return pd.DataFrame()

    agg = (
        daily_df.groupby(["area_code", "area_name", "admin_level_2"])
        .agg(
            daily_mean_people=("people", "mean"),
            daily_max_people=("people", "max"),
            days_observed=("batch_date", "nunique"),
        )
        .reset_index()
    )
    agg["daily_mean_people"] = agg["daily_mean_people"].round(1)
    logger.info("Built metadata for %d distinct areas", len(agg))
    return agg


def load_all(data_root: Path = DATA_ROOT) -> None:
    """Load all Telia data and populate the in-memory store."""
    logger.info("Loading Telia Eventwood data from %s", data_root)

    store.telia_daily = load_daily(data_root)
    store.telia_hourly = load_hourly(data_root)
    store.telia_areas = build_area_metadata(store.telia_daily, store.telia_hourly)

    _print_summary()


def _print_summary() -> None:
    """Print summary statistics to stdout."""
    print("\n" + "=" * 70)
    print("  TELIA EVENTWOOD — Load Summary")
    print("=" * 70)

    if not store.telia_daily.empty:
        df = store.telia_daily
        print(f"  Daily activities : {len(df):>8,} rows")
        print(f"  Date range       : {df['batch_date'].min()} → {df['batch_date'].max()}")
        print(f"  Distinct areas   : {df['area_code'].nunique():>8,}")
        print(f"  Total people·days: {df['people'].sum():>12,}")
    else:
        print("  Daily activities : (not loaded)")

    if not store.telia_hourly.empty:
        df = store.telia_hourly
        print(f"  Hourly activities: {len(df):>8,} rows")
        print(f"  Hours range      : {df['hour'].min():02d}:00 → {df['hour'].max():02d}:00")
    else:
        print("  Hourly activities: (not loaded)")

    if not store.telia_areas.empty:
        print(f"  Area metadata    : {len(store.telia_areas):>8,} areas")

    print("=" * 70 + "\n")


# ── Standalone entry point ──────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
    load_all()
