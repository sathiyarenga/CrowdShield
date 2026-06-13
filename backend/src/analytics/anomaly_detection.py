"""Anomaly detection via Z-score against baselines.

Threshold classification:
  • |z| ≤ 1σ  → NORMAL
  • |z| > 1σ  → ELEVATED
  • |z| > 2σ  → HIGH
  • |z| > 3σ  → CRITICAL
"""

from __future__ import annotations

import logging
from typing import Literal

import numpy as np
import pandas as pd

from src.etl.data_store import store
from src.ontology.controlled_vocab import AlertSeverity

logger = logging.getLogger(__name__)

# Z-score thresholds
THRESHOLDS: list[tuple[float, AlertSeverity]] = [
    (3.0, AlertSeverity.CRITICAL),
    (2.0, AlertSeverity.HIGH),
    (1.0, AlertSeverity.ELEVATED),
]


def compute_zscore(current: float, baseline_mean: float, baseline_std: float) -> float:
    """Compute the Z-score of a current observation against the baseline.

    Parameters
    ----------
    current : float
        The current observed value.
    baseline_mean : float
        The baseline mean for this time slot.
    baseline_std : float
        The baseline standard deviation for this time slot.

    Returns
    -------
    float
        The Z-score. Returns 0.0 if baseline_std is zero.
    """
    if baseline_std == 0 or np.isnan(baseline_std):
        return 0.0
    return (current - baseline_mean) / baseline_std


def classify_severity(z_score: float) -> AlertSeverity | None:
    """Map a Z-score to an alert severity level.

    Returns None if the Z-score is within 1σ (normal).
    """
    abs_z = abs(z_score)
    for threshold, severity in THRESHOLDS:
        if abs_z >= threshold:
            return severity
    return None  # Normal / no alert


def classify_label(z_score: float) -> str:
    """Map a Z-score to a human-readable label."""
    severity = classify_severity(z_score)
    if severity is None:
        return "NORMAL"
    return severity.value


def score_ullevaal_timeseries(
    target_date=None,
) -> pd.DataFrame:
    """Score each observation in the Ullevaal summary against its baseline.

    Parameters
    ----------
    target_date : date, optional
        If provided, only score this date. Otherwise, score all dates.

    Returns
    -------
    pd.DataFrame
        Original summary data enriched with:
        z_score, severity, baseline_mean, baseline_std
    """
    df = store.telcofy_summary.copy()
    baselines = store.ullevaal_baselines

    if df.empty or baselines.empty:
        logger.warning("Data or baselines not loaded")
        return pd.DataFrame()

    if target_date is not None:
        df = df[df["batch_data"] == target_date].copy()

    # Merge baselines by hour
    df = df.merge(
        baselines[["hour_of_day", "baseline_mean", "baseline_std"]],
        left_on="hour",
        right_on="hour_of_day",
        how="left",
    )

    df["z_score"] = df.apply(
        lambda row: compute_zscore(row["people"], row["baseline_mean"], row["baseline_std"]),
        axis=1,
    )
    df["z_score"] = df["z_score"].round(2)
    df["severity"] = df["z_score"].apply(classify_label)

    logger.info(
        "Scored %d observations: %d CRITICAL, %d HIGH, %d ELEVATED",
        len(df),
        (df["severity"] == "CRITICAL").sum(),
        (df["severity"] == "HIGH").sum(),
        (df["severity"] == "ELEVATED").sum(),
    )
    return df


def score_fredrikstad_observation(
    area_code: str,
    day_of_week: int,
    hour: int,
    people_count: int,
) -> dict:
    """Score a single Fredrikstad observation against its baseline.

    Returns
    -------
    dict
        Contains: z_score, severity, baseline_mean, baseline_std
    """
    baselines = store.fredrikstad_baselines
    if baselines.empty:
        return {
            "z_score": 0.0,
            "severity": "NORMAL",
            "baseline_mean": None,
            "baseline_std": None,
        }

    mask = (
        (baselines["area_code"] == area_code)
        & (baselines["day_of_week"] == day_of_week)
        & (baselines["hour_of_day"] == hour)
    )
    match = baselines[mask]

    if match.empty:
        return {
            "z_score": 0.0,
            "severity": "NORMAL",
            "baseline_mean": None,
            "baseline_std": None,
        }

    row = match.iloc[0]
    z = compute_zscore(people_count, row["baseline_mean"], row["baseline_std"])
    return {
        "z_score": round(z, 2),
        "severity": classify_label(z),
        "baseline_mean": round(row["baseline_mean"], 1),
        "baseline_std": round(row["baseline_std"], 1),
    }
