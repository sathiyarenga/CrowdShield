"""Cross-Event Benchmarking for CrowdShield.

Provides comparative analytics across the stored event fingerprints:

1. **Comparison table** — peak, ingress/egress duration, total attendance side-by-side.
2. **Percentile rankings** — "This event's peak was at the 80th percentile."
3. **Pattern similarity** — which events had similar ingress/crowd curves?
4. **Predictive ranges** — "Expect peak between X–Y at time T ± σ."
"""

from __future__ import annotations

import logging
from datetime import date

import numpy as np
import pandas as pd

from src.etl.data_store import store

logger = logging.getLogger(__name__)


# ═════════════════════════════════════════════════════════════════════════════
# 1. Comparison table
# ═════════════════════════════════════════════════════════════════════════════

def get_event_comparison_table() -> list[dict]:
    """Build a side-by-side comparison of all event fingerprints.

    Returns
    -------
    list[dict]
        One dict per event date with standardised metrics.
    """
    fp_df = _get_fingerprints_df()
    if fp_df.empty:
        return []

    metrics = [
        "event_date", "peak_count", "peak_time",
        "ingress_duration_minutes", "egress_duration_minutes",
        "clearance_time_minutes", "total_person_hours",
        "baseline_floor", "sigma_above_baseline", "observation_count",
    ]
    available = [c for c in metrics if c in fp_df.columns]
    result = fp_df[available].copy()

    # Add derived fields
    if "peak_count" in result.columns and "baseline_floor" in result.columns:
        result["amplitude"] = result["peak_count"] - result["baseline_floor"]
        result["amplitude_ratio"] = (
            result["peak_count"] / result["baseline_floor"].replace(0, np.nan)
        ).round(2)

    records = result.to_dict(orient="records")
    logger.info("Comparison table: %d events", len(records))
    return records


# ═════════════════════════════════════════════════════════════════════════════
# 2. Percentile rankings
# ═════════════════════════════════════════════════════════════════════════════

def compute_percentile_rankings(target_date: str | date | None = None) -> dict:
    """Compute percentile ranks for each event across key metrics.

    Parameters
    ----------
    target_date : str or date, optional
        If provided, return this event's position; otherwise return all.

    Returns
    -------
    dict
        {"rankings": [...], "target_event": {...} | None}
    """
    fp_df = _get_fingerprints_df()
    if fp_df.empty:
        return {"rankings": [], "target_event": None}

    rank_metrics = [
        "peak_count",
        "total_person_hours",
        "ingress_duration_minutes",
        "egress_duration_minutes",
        "clearance_time_minutes",
        "sigma_above_baseline",
    ]
    available_metrics = [m for m in rank_metrics if m in fp_df.columns]

    rankings: list[dict] = []
    for _, row in fp_df.iterrows():
        entry: dict = {"event_date": str(row.get("event_date", ""))}
        for metric in available_metrics:
            val = row.get(metric)
            if val is not None and not _is_nan(val):
                col_vals = fp_df[metric].dropna().values
                if len(col_vals) > 0:
                    percentile = float(np.sum(col_vals <= val) / len(col_vals) * 100)
                    entry[f"{metric}_value"] = _safe_num(val)
                    entry[f"{metric}_percentile"] = round(percentile, 1)
                    entry[f"{metric}_rank"] = int(np.sum(col_vals > val)) + 1
        rankings.append(entry)

    # Extract target event if requested
    target_event = None
    if target_date is not None:
        target_str = str(target_date)
        matches = [r for r in rankings if r["event_date"] == target_str]
        target_event = matches[0] if matches else None

    logger.info(
        "Percentile rankings computed for %d events, %d metrics",
        len(rankings), len(available_metrics),
    )
    return {
        "total_events": len(rankings),
        "metrics_ranked": available_metrics,
        "rankings": rankings,
        "target_event": target_event,
    }


# ═════════════════════════════════════════════════════════════════════════════
# 3. Pattern similarity
# ═════════════════════════════════════════════════════════════════════════════

def compute_pattern_similarity() -> dict:
    """Compute pairwise similarity between event ingress/crowd curves.

    Uses cosine similarity on hourly people-count vectors.

    Returns
    -------
    dict
        {"similarity_matrix": [[...]], "event_dates": [...], "most_similar_pairs": [...]}
    """
    df = store.telcofy_summary
    if df.empty:
        return {"similarity_matrix": [], "event_dates": [], "most_similar_pairs": []}

    event_dates = sorted(df["batch_data"].unique())
    if len(event_dates) < 2:
        return {
            "similarity_matrix": [[1.0]],
            "event_dates": [str(event_dates[0])] if event_dates else [],
            "most_similar_pairs": [],
        }

    # Build hourly vectors for each event (24 hours, mean people per hour)
    vectors: dict[str, np.ndarray] = {}
    for d in event_dates:
        day_df = df[df["batch_data"] == d]
        hourly = day_df.groupby("hour")["people"].mean()
        # Ensure we have 0–23 hours
        vec = np.zeros(24)
        for h, val in hourly.items():
            if 0 <= h < 24:
                vec[int(h)] = val
        vectors[str(d)] = vec

    date_keys = list(vectors.keys())
    n = len(date_keys)

    # Cosine similarity matrix
    sim_matrix = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            a, b = vectors[date_keys[i]], vectors[date_keys[j]]
            norm_a, norm_b = np.linalg.norm(a), np.linalg.norm(b)
            if norm_a > 0 and norm_b > 0:
                sim_matrix[i, j] = float(np.dot(a, b) / (norm_a * norm_b))
            else:
                sim_matrix[i, j] = 0.0

    # Find most similar pairs (excluding self)
    pairs: list[dict] = []
    for i in range(n):
        for j in range(i + 1, n):
            pairs.append({
                "event_a": date_keys[i],
                "event_b": date_keys[j],
                "cosine_similarity": round(sim_matrix[i, j], 4),
            })
    pairs.sort(key=lambda p: p["cosine_similarity"], reverse=True)

    logger.info(
        "Pattern similarity: %d events, most similar: %s↔%s (%.3f)",
        n,
        pairs[0]["event_a"] if pairs else "N/A",
        pairs[0]["event_b"] if pairs else "N/A",
        pairs[0]["cosine_similarity"] if pairs else 0,
    )

    return {
        "event_dates": date_keys,
        "similarity_matrix": np.round(sim_matrix, 4).tolist(),
        "most_similar_pairs": pairs[:5],  # Top 5 most similar
    }


# ═════════════════════════════════════════════════════════════════════════════
# 4. Predictive ranges
# ═════════════════════════════════════════════════════════════════════════════

def compute_predictive_ranges() -> dict:
    """Compute predictive ranges for key event metrics based on historical data.

    Returns
    -------
    dict
        Statistical ranges with mean, std, CI for peak, timing, durations.
    """
    fp_df = _get_fingerprints_df()
    if fp_df.empty:
        return {"error": "No fingerprints available", "ranges": {}}

    n_events = len(fp_df)

    # Metrics to produce ranges for
    range_metrics = {
        "peak_count": "Peak crowd count",
        "total_person_hours": "Total person-hours",
        "ingress_duration_minutes": "Ingress duration (minutes)",
        "egress_duration_minutes": "Egress duration (minutes)",
        "clearance_time_minutes": "Clearance time (minutes)",
        "sigma_above_baseline": "Standard deviations above baseline",
    }

    ranges: dict[str, dict] = {}
    for metric, description in range_metrics.items():
        if metric not in fp_df.columns:
            continue
        vals = fp_df[metric].dropna().values.astype(float)
        if len(vals) == 0:
            continue

        mean_val = float(np.mean(vals))
        std_val = float(np.std(vals, ddof=1)) if len(vals) > 1 else 0.0

        ranges[metric] = {
            "description": description,
            "mean": round(mean_val, 2),
            "std": round(std_val, 2),
            "min": round(float(np.min(vals)), 2),
            "max": round(float(np.max(vals)), 2),
            "median": round(float(np.median(vals)), 2),
            "prediction_range_1sigma": [
                round(mean_val - std_val, 2),
                round(mean_val + std_val, 2),
            ],
            "prediction_range_2sigma": [
                round(mean_val - 2 * std_val, 2),
                round(mean_val + 2 * std_val, 2),
            ],
            "sample_count": len(vals),
        }

    # Peak timing prediction (hour-of-day)
    peak_hours = _extract_peak_hours(fp_df)
    if peak_hours:
        arr = np.array(peak_hours, dtype=float)
        ranges["peak_hour"] = {
            "description": "Expected peak hour (0–23 UTC)",
            "mean": round(float(np.mean(arr)), 1),
            "std": round(float(np.std(arr, ddof=1)), 1) if len(arr) > 1 else 0.0,
            "min": int(np.min(arr)),
            "max": int(np.max(arr)),
            "prediction_range_1sigma": [
                round(float(np.mean(arr) - np.std(arr, ddof=1)), 1) if len(arr) > 1 else float(np.mean(arr)),
                round(float(np.mean(arr) + np.std(arr, ddof=1)), 1) if len(arr) > 1 else float(np.mean(arr)),
            ],
            "sample_count": len(arr),
        }

    logger.info("Predictive ranges computed for %d metrics from %d events", len(ranges), n_events)

    return {
        "based_on_events": n_events,
        "event_dates": [str(d) for d in fp_df["event_date"].tolist()] if "event_date" in fp_df.columns else [],
        "ranges": ranges,
        "summary": _build_narrative(ranges, n_events),
    }


def get_single_event_benchmark(target_date: str | date) -> dict:
    """Position a single event against historical benchmarks.

    Returns
    -------
    dict
        The event's metrics with percentile context and narrative.
    """
    target_str = str(target_date)
    comparison = get_event_comparison_table()
    rankings = compute_percentile_rankings(target_date=target_str)
    ranges = compute_predictive_ranges()

    target_event = rankings.get("target_event")
    if not target_event:
        # Try to find in comparison table
        matches = [c for c in comparison if str(c.get("event_date")) == target_str]
        if not matches:
            return {
                "error": f"No data found for event date {target_str}",
                "available_dates": [str(c.get("event_date")) for c in comparison],
            }

    return {
        "event_date": target_str,
        "event_metrics": target_event,
        "percentile_context": target_event,
        "predictive_ranges": ranges.get("ranges", {}),
        "total_events_compared": rankings.get("total_events", 0),
        "narrative": _build_event_narrative(target_event, ranges.get("ranges", {})),
    }


# ═════════════════════════════════════════════════════════════════════════════
# Full benchmark package
# ═════════════════════════════════════════════════════════════════════════════

def get_full_benchmark() -> dict:
    """Assemble the complete cross-event benchmark package.

    Returns
    -------
    dict
        Comparison table, percentile rankings, similarity, and predictive ranges.
    """
    return {
        "comparison_table": get_event_comparison_table(),
        "percentile_rankings": compute_percentile_rankings(),
        "pattern_similarity": compute_pattern_similarity(),
        "predictive_ranges": compute_predictive_ranges(),
    }


# ═════════════════════════════════════════════════════════════════════════════
# Private helpers
# ═════════════════════════════════════════════════════════════════════════════

def _get_fingerprints_df() -> pd.DataFrame:
    """Retrieve or compute the fingerprints DataFrame."""
    fp_df = store.ullevaal_fingerprints
    if isinstance(fp_df, pd.DataFrame) and not fp_df.empty:
        return fp_df

    # Try computing them
    from src.analytics.event_fingerprint import compute_all_fingerprints
    fingerprints = compute_all_fingerprints()
    if fingerprints:
        return store.ullevaal_fingerprints
    return pd.DataFrame()


def _is_nan(val) -> bool:
    """Check if a value is NaN (works for float and other types)."""
    try:
        return np.isnan(float(val))
    except (ValueError, TypeError):
        return False


def _safe_num(val) -> float | int | None:
    """Convert a value to a JSON-safe number."""
    if val is None or _is_nan(val):
        return None
    try:
        f = float(val)
        if f == int(f):
            return int(f)
        return round(f, 2)
    except (ValueError, TypeError):
        return None


def _extract_peak_hours(fp_df: pd.DataFrame) -> list[int]:
    """Extract peak hour (0–23) from fingerprint peak_time strings."""
    hours: list[int] = []
    if "peak_time" not in fp_df.columns:
        return hours
    for pt in fp_df["peak_time"].dropna():
        try:
            # peak_time is stored as string like "2025-09-02 19:00:00"
            from datetime import datetime
            dt = datetime.fromisoformat(str(pt))
            hours.append(dt.hour)
        except (ValueError, TypeError):
            pass
    return hours


def _build_narrative(ranges: dict, n_events: int) -> str:
    """Build a human-readable narrative from predictive ranges."""
    parts = [f"Based on {n_events} observed events:"]

    if "peak_count" in ranges:
        r = ranges["peak_count"]
        parts.append(
            f"• Expect peak crowd between {r['prediction_range_1sigma'][0]:,.0f} "
            f"and {r['prediction_range_1sigma'][1]:,.0f} "
            f"(mean: {r['mean']:,.0f} ± {r['std']:,.0f})."
        )

    if "peak_hour" in ranges:
        r = ranges["peak_hour"]
        parts.append(
            f"• Peak typically occurs around hour {r['mean']:.0f} UTC "
            f"(range: {r['min']}–{r['max']})."
        )

    if "ingress_duration_minutes" in ranges:
        r = ranges["ingress_duration_minutes"]
        parts.append(
            f"• Ingress lasts {r['mean']:.0f} ± {r['std']:.0f} minutes on average."
        )

    if "clearance_time_minutes" in ranges:
        r = ranges["clearance_time_minutes"]
        parts.append(
            f"• Clearance takes {r['mean']:.0f} ± {r['std']:.0f} minutes on average."
        )

    return "\n".join(parts)


def _build_event_narrative(event_data: dict | None, ranges: dict) -> str:
    """Build a narrative for a single event positioned against benchmarks."""
    if not event_data:
        return "Insufficient data for narrative."

    parts: list[str] = [f"Event on {event_data.get('event_date', 'unknown')}:"]

    # Peak count percentile
    if "peak_count_percentile" in event_data:
        pct = event_data["peak_count_percentile"]
        val = event_data.get("peak_count_value", "N/A")
        parts.append(
            f"• Peak of {val:,} was at the {pct:.0f}th percentile of all observed events."
        )

    # Ingress duration
    if "ingress_duration_minutes_percentile" in event_data:
        pct = event_data["ingress_duration_minutes_percentile"]
        val = event_data.get("ingress_duration_minutes_value", "N/A")
        parts.append(
            f"• Ingress duration of {val} min was at the {pct:.0f}th percentile."
        )

    return "\n".join(parts) if len(parts) > 1 else "Event analysis complete."
