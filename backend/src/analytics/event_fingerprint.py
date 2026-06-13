"""Event fingerprint detection and characterisation.

An event "fingerprint" captures the temporal signature of a mass gathering:
  • ingress onset and duration
  • peak time and count
  • egress onset and duration
  • clearance time

Detection uses σ-threshold on maximum people count relative to the
non-event baseline.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd

from src.etl.data_store import store

logger = logging.getLogger(__name__)

# Detection threshold: how many σ above baseline_mean the daily max must be
EVENT_SIGMA_THRESHOLD = 2.0

# Ingress/egress detection: fraction of peak above baseline
INGRESS_THRESHOLD_FRAC = 0.15  # 15 % of (peak - baseline)
EGRESS_THRESHOLD_FRAC = 0.15


def detect_event_days(sigma_threshold: float = EVENT_SIGMA_THRESHOLD) -> pd.DataFrame:
    """Identify event days from the Ullevaal summary time-series.

    An event day is one where ``max_people > baseline_mean + σ × baseline_std``.

    Returns
    -------
    pd.DataFrame
        Columns: date, max_people, is_event, sigma_above_baseline
    """
    df = store.telcofy_summary
    baselines = store.ullevaal_baselines

    if df.empty:
        logger.warning("No Telcofy summary data loaded")
        return pd.DataFrame()

    if baselines.empty:
        logger.warning("No baselines computed — run compute_ullevaal_baseline() first")
        return pd.DataFrame()

    # Global baseline stats (mean of hourly means as overall reference)
    global_mean = baselines["baseline_mean"].mean()
    global_std = baselines["baseline_mean"].std()
    if global_std == 0:
        global_std = 1.0  # avoid div-by-zero

    # Per-date max
    daily_max = (
        df.groupby("batch_data")
        .agg(max_people=("people", "max"))
        .reset_index()
        .rename(columns={"batch_data": "date"})
    )

    daily_max["sigma_above_baseline"] = (
        (daily_max["max_people"] - global_mean) / global_std
    ).round(2)
    daily_max["is_event"] = daily_max["sigma_above_baseline"] >= sigma_threshold

    logger.info(
        "Detected %d event days out of %d total (σ=%.1f, mean=%.0f, std=%.0f)",
        daily_max["is_event"].sum(),
        len(daily_max),
        sigma_threshold,
        global_mean,
        global_std,
    )
    return daily_max


def compute_fingerprint(event_date: date) -> dict | None:
    """Compute the full event fingerprint for a specific date.

    Parameters
    ----------
    event_date : date
        The date to fingerprint (must exist in the summary data).

    Returns
    -------
    dict or None
        Fingerprint metrics including ingress/peak/egress characterisation.
    """
    df = store.telcofy_summary
    if df.empty:
        return None

    day_df = df[df["batch_data"] == event_date].copy()
    if day_df.empty:
        logger.warning("No data for date %s", event_date)
        return None

    day_df = day_df.sort_values("timestamp")

    # Baseline: use overnight floor or Sep 3 mean
    baselines = store.ullevaal_baselines
    if not baselines.empty:
        baseline_floor = baselines["overnight_floor_mean"].iloc[0]
    else:
        baseline_floor = day_df["people"].quantile(0.1)

    peak_idx = day_df["people"].idxmax()
    peak_row = day_df.loc[peak_idx]
    peak_count = int(peak_row["people"])
    peak_time = peak_row["timestamp"]

    amplitude = peak_count - baseline_floor
    ingress_line = baseline_floor + amplitude * INGRESS_THRESHOLD_FRAC
    egress_line = baseline_floor + amplitude * INGRESS_THRESHOLD_FRAC

    # ── Ingress onset: first time above ingress_line (before peak) ──
    pre_peak = day_df[day_df["timestamp"] <= peak_time]
    above_ingress = pre_peak[pre_peak["people"] >= ingress_line]
    ingress_onset = above_ingress["timestamp"].iloc[0] if not above_ingress.empty else None

    # ── Egress onset: first time people start dropping after peak ──
    post_peak = day_df[day_df["timestamp"] > peak_time]
    # Find when it first drops significantly (sustained)
    egress_onset = None
    if not post_peak.empty:
        # Rolling mean to smooth
        post_peak = post_peak.copy()
        post_peak["smooth"] = post_peak["people"].rolling(3, min_periods=1).mean()
        dropping = post_peak[post_peak["smooth"] < peak_count * 0.9]
        if not dropping.empty:
            egress_onset = dropping["timestamp"].iloc[0]

    # ── Clearance: when count returns to near baseline after peak ──
    clearance_time = None
    if not post_peak.empty:
        near_baseline = post_peak[post_peak["people"] <= ingress_line]
        if not near_baseline.empty:
            clearance_time = near_baseline["timestamp"].iloc[0]

    # ── Durations ──
    ingress_duration = None
    if ingress_onset is not None:
        ingress_duration = (peak_time - ingress_onset).total_seconds() / 60.0

    egress_duration = None
    if egress_onset is not None and clearance_time is not None:
        egress_duration = (clearance_time - egress_onset).total_seconds() / 60.0

    clearance_minutes = None
    if clearance_time is not None:
        clearance_minutes = (clearance_time - peak_time).total_seconds() / 60.0

    # ── Total person-hours (trapezoidal integration) ──
    times = day_df["timestamp"].values
    people = day_df["people"].values
    hours_diff = np.diff(times).astype("timedelta64[s]").astype(float) / 3600.0
    person_hours = float(np.sum((people[:-1] + people[1:]) / 2.0 * hours_diff))

    fingerprint = {
        "event_date": str(event_date),
        "is_event_day": peak_count > baseline_floor * 2,
        "peak_count": peak_count,
        "peak_time": str(peak_time),
        "baseline_floor": round(baseline_floor, 0),
        "sigma_above_baseline": round(
            (peak_count - baseline_floor) / max(1, baselines["baseline_std"].mean())
            if not baselines.empty else 0,
            2,
        ),
        "ingress_onset": str(ingress_onset) if ingress_onset is not None else None,
        "ingress_duration_minutes": round(ingress_duration, 1) if ingress_duration else None,
        "egress_onset": str(egress_onset) if egress_onset is not None else None,
        "egress_duration_minutes": round(egress_duration, 1) if egress_duration else None,
        "clearance_time_minutes": round(clearance_minutes, 1) if clearance_minutes else None,
        "total_person_hours": round(person_hours, 0),
        "observation_count": len(day_df),
    }

    logger.info(
        "Fingerprint for %s: peak=%d at %s, ingress_dur=%.0f min",
        event_date,
        peak_count,
        peak_time,
        ingress_duration or 0,
    )
    return fingerprint


def compute_all_fingerprints() -> list[dict]:
    """Compute fingerprints for all dates in the Ullevaal dataset.

    Returns
    -------
    list[dict]
        List of fingerprint dicts.
    """
    df = store.telcofy_summary
    if df.empty:
        return []

    dates = sorted(df["batch_data"].unique())
    fingerprints = []
    for d in dates:
        fp = compute_fingerprint(d)
        if fp is not None:
            fingerprints.append(fp)

    store.ullevaal_fingerprints = pd.DataFrame(fingerprints)
    logger.info("Computed %d fingerprints", len(fingerprints))
    return fingerprints
