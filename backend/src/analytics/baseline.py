"""Baseline computation for Ullevaal and Fredrikstad venues.

Baselines are the statistical "normal" that anomaly detection
compares live observations against.

Strategy for Ullevaal
─────────────────────
• **Overnight floor**: 02:00-05:00 UTC across all dates → absolute floor.
• **Full-day reference**: Sep 3 (non-event day, flat ~3,500-5,500) as baseline.
• Per-hour-of-day statistics: mean, std, p95.

Strategy for Fredrikstad
────────────────────────
• Per (area_code, day_of_week, hour_of_day): mean, std, p95.
• Uses all 31 days of July 2023 data.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from src.etl.data_store import store

logger = logging.getLogger(__name__)


def compute_ullevaal_baseline() -> pd.DataFrame:
    """Compute per-hour-of-day baseline from Ullevaal non-event data.

    Uses overnight hours (02:00-05:00 UTC) as the overnight floor and
    Sep 3 (non-event day) as the full-day reference.

    Returns
    -------
    pd.DataFrame
        Columns: hour_of_day, baseline_mean, baseline_std, percentile_95,
                 overnight_floor_mean, sample_count
    """
    df = store.telcofy_summary
    if df.empty:
        logger.warning("Telcofy summary not loaded — cannot compute baseline")
        return pd.DataFrame()

    # Sep 3 is the non-event reference day
    from datetime import date
    baseline_date = date(2025, 9, 3)
    baseline_df = df[df["batch_data"] == baseline_date].copy()

    if baseline_df.empty:
        logger.warning("No data for baseline date %s", baseline_date)
        return pd.DataFrame()

    # Per-hour stats from the baseline day
    hourly = (
        baseline_df
        .groupby("hour")
        .agg(
            baseline_mean=("people", "mean"),
            baseline_std=("people", "std"),
            percentile_95=("people", lambda x: np.percentile(x, 95)),
            sample_count=("people", "count"),
        )
        .reset_index()
        .rename(columns={"hour": "hour_of_day"})
    )
    hourly["baseline_std"] = hourly["baseline_std"].fillna(0)

    # Overnight floor (02:00-05:00) across ALL dates for a robust floor
    overnight = df[df["hour"].between(2, 4)]
    if not overnight.empty:
        hourly["overnight_floor_mean"] = overnight["people"].mean()
    else:
        hourly["overnight_floor_mean"] = 0.0

    logger.info(
        "Computed Ullevaal baseline: %d hours, floor=%.0f",
        len(hourly),
        hourly["overnight_floor_mean"].iloc[0] if not hourly.empty else 0,
    )

    store.ullevaal_baselines = hourly
    return hourly


def compute_fredrikstad_baselines() -> pd.DataFrame:
    """Compute per-area, per-day-of-week, per-hour baselines from Telia data.

    Returns
    -------
    pd.DataFrame
        Columns: area_code, area_name, day_of_week, hour_of_day,
                 baseline_mean, baseline_std, percentile_95, sample_count
    """
    df = store.telia_hourly
    if df.empty:
        logger.warning("Telia hourly not loaded — cannot compute baselines")
        return pd.DataFrame()

    # Add day-of-week (0=Mon, 6=Sun)
    df = df.copy()
    df["day_of_week"] = pd.to_datetime(df["batch_date"]).dt.dayofweek

    baselines = (
        df.groupby(["area_code", "area_name", "day_of_week", "hour"])
        .agg(
            baseline_mean=("people", "mean"),
            baseline_std=("people", "std"),
            percentile_95=("people", lambda x: np.percentile(x, 95)),
            sample_count=("people", "count"),
        )
        .reset_index()
        .rename(columns={"hour": "hour_of_day"})
    )
    baselines["baseline_std"] = baselines["baseline_std"].fillna(0)

    logger.info(
        "Computed Fredrikstad baselines: %d rows across %d areas",
        len(baselines),
        baselines["area_code"].nunique(),
    )

    store.fredrikstad_baselines = baselines
    return baselines
