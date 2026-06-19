"""Analytics API endpoints for Ullevaal and Fredrikstad data.

Endpoints
─────────
GET /api/analytics/ullevaal/summary            → time-series for all event dates
GET /api/analytics/ullevaal/events              → detected event fingerprints
GET /api/analytics/ullevaal/anomalies?date=     → anomaly-scored time-series
GET /api/analytics/ullevaal/breakdown/{date}    → nationality breakdown
GET /api/analytics/fredrikstad/hourly           → hourly data with filters
GET /api/analytics/fredrikstad/areas            → area metadata + stats
GET /api/analytics/zones                        → venue zones with GeoJSON
"""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from src.analytics.anomaly_detection import score_ullevaal_timeseries
from src.analytics.event_fingerprint import compute_all_fingerprints, detect_event_days
from src.etl.data_store import store

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# ═════════════════════════════════════════════════════════════════════════════
# Ullevaal Stadion (Telcofy)
# ═════════════════════════════════════════════════════════════════════════════


@router.get("/ullevaal/summary")
async def ullevaal_summary(
    date_filter: Annotated[date | None, Query(alias="date")] = None,
    resample: Annotated[str | None, Query(description="Resample interval, e.g. '15min', '1h'")] = None,
) -> dict:
    """Return Ullevaal time-series data for all or a specific event date.

    Parameters
    ----------
    date_filter : date, optional
        Filter to a single date.
    resample : str, optional
        Resample to coarser intervals (e.g. "15min", "1h").
    """
    df = store.telcofy_summary
    if df.empty:
        raise HTTPException(status_code=503, detail="Telcofy data not loaded")

    if date_filter is not None:
        df = df[df["batch_data"] == date_filter]
        if df.empty:
            raise HTTPException(status_code=404, detail=f"No data for date {date_filter}")

    if resample:
        df = df.set_index("timestamp").resample(resample).agg({"people": "mean"}).reset_index()
        df["people"] = df["people"].round(0).astype(int)

    records = df[["timestamp", "people", "area_name"]].copy()
    records["timestamp"] = records["timestamp"].astype(str)

    dates_available = sorted(store.telcofy_summary["batch_data"].unique())

    return {
        "total_records": len(records),
        "dates_available": [str(d) for d in dates_available],
        "data": records.to_dict(orient="records"),
    }


@router.get("/ullevaal/events")
async def ullevaal_events() -> dict:
    """Return detected event fingerprints for all dates."""
    # Ensure fingerprints are computed
    if store.ullevaal_fingerprints.empty:
        fingerprints = compute_all_fingerprints()
    else:
        fingerprints = store.ullevaal_fingerprints.to_dict(orient="records")

    # Also get event detection summary
    event_days = detect_event_days()
    event_summary = event_days.to_dict(orient="records") if not event_days.empty else []

    return {
        "event_detection": event_summary,
        "fingerprints": fingerprints if isinstance(fingerprints, list) else [],
    }


@router.get("/ullevaal/anomalies")
async def ullevaal_anomalies(
    date_filter: Annotated[date | None, Query(alias="date")] = None,
) -> dict:
    """Return anomaly-scored time-series for Ullevaal.

    Each observation is enriched with z_score and severity level.
    """
    scored = score_ullevaal_timeseries(target_date=date_filter)
    if scored.empty:
        raise HTTPException(status_code=503, detail="Cannot compute anomalies (data/baselines missing)")

    result = scored[
        ["timestamp", "people", "hour", "baseline_mean", "baseline_std", "z_score", "severity"]
    ].copy()
    result["timestamp"] = result["timestamp"].astype(str)

    # Summary stats
    severity_counts = result["severity"].value_counts().to_dict()

    return {
        "total_records": len(result),
        "severity_summary": severity_counts,
        "data": result.to_dict(orient="records"),
    }


@router.get("/ullevaal/breakdown/{target_date}")
async def ullevaal_breakdown(target_date: date) -> dict:
    """Return nationality breakdown for a specific date.

    Parameters
    ----------
    target_date : date
        Date in YYYY-MM-DD format.
    """
    df = store.telcofy_breakdown
    if df.empty:
        raise HTTPException(status_code=503, detail="Breakdown data not loaded")

    day_df = df[df["batch_data"] == target_date]
    if day_df.empty:
        raise HTTPException(status_code=404, detail=f"No breakdown data for {target_date}")

    # Aggregate by country
    country_totals = (
        day_df.groupby("country")
        .agg(total_people=("people", "sum"), observation_count=("people", "count"))
        .sort_values("total_people", ascending=False)
        .reset_index()
    )

    # Time-series per country
    timeseries = day_df[["timestamp", "country", "people"]].copy()
    timeseries["timestamp"] = timeseries["timestamp"].astype(str)

    return {
        "date": str(target_date),
        "countries": country_totals.to_dict(orient="records"),
        "timeseries_count": len(timeseries),
        "timeseries": timeseries.to_dict(orient="records"),
    }


# ═════════════════════════════════════════════════════════════════════════════
# Fredrikstad (Telia)
# ═════════════════════════════════════════════════════════════════════════════


@router.get("/fredrikstad/hourly")
async def fredrikstad_hourly(
    area_code: Annotated[str | None, Query(description="Filter by area_code")] = None,
    area_name: Annotated[str | None, Query(description="Filter by area_name (partial match)")] = None,
    date_from: Annotated[date | None, Query(description="Start date")] = None,
    date_to: Annotated[date | None, Query(description="End date")] = None,
    hour_from: Annotated[int | None, Query(ge=0, le=23)] = None,
    hour_to: Annotated[int | None, Query(ge=0, le=23)] = None,
    limit: Annotated[int, Query(ge=1, le=10_000)] = 1000,
) -> dict:
    """Return hourly activity data for Fredrikstad with optional filters."""
    df = store.telia_hourly
    if df.empty:
        raise HTTPException(status_code=503, detail="Telia hourly data not loaded")

    if area_code:
        df = df[df["area_code"] == area_code]
    if area_name:
        df = df[df["area_name"].str.contains(area_name, case=False, na=False)]
    if date_from:
        df = df[df["batch_date"] >= date_from]
    if date_to:
        df = df[df["batch_date"] <= date_to]
    if hour_from is not None:
        df = df[df["hour"] >= hour_from]
    if hour_to is not None:
        df = df[df["hour"] <= hour_to]

    total = len(df)
    df = df.head(limit)

    result = df[["batch_date", "local_hour", "area_name", "area_code", "people", "hour", "rating"]].copy()
    result["batch_date"] = result["batch_date"].astype(str)
    result["local_hour"] = result["local_hour"].astype(str)

    return {
        "total_matching": total,
        "returned": len(result),
        "limit": limit,
        "data": result.to_dict(orient="records"),
    }


@router.get("/fredrikstad/areas")
async def fredrikstad_areas(
    sort_by: Annotated[str, Query(description="Sort field")] = "daily_max_people",
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
) -> dict:
    """Return area metadata with aggregate statistics + geocoded coordinates."""
    df = store.telia_areas
    if df.empty:
        raise HTTPException(status_code=503, detail="Telia area metadata not computed")

    from src.etl.geocoder import load_geocache
    geocache = load_geocache()

    if sort_by in df.columns:
        df = df.sort_values(sort_by, ascending=False)

    result = df.head(limit)
    records = result.to_dict(orient="records")

    # Enrich with geocoded lat/lon
    for rec in records:
        code = str(rec.get("area_code", ""))
        geo = geocache.get(code)
        if geo:
            rec["lat"] = geo["lat"]
            rec["lon"] = geo["lon"]
        else:
            rec["lat"] = None
            rec["lon"] = None

    return {
        "total_areas": len(store.telia_areas),
        "returned": len(records),
        "data": records,
    }


@router.get("/fredrikstad/areas/geojson")
async def fredrikstad_geojson() -> dict:
    """Return all Fredrikstad areas as a GeoJSON FeatureCollection for MapLibre."""
    df = store.telia_areas
    if df.empty:
        raise HTTPException(status_code=503, detail="Telia area metadata not computed")

    from src.etl.geocoder import load_geocache
    geocache = load_geocache()

    features = []
    for _, row in df.iterrows():
        code = str(row.get("area_code", ""))
        geo = geocache.get(code)
        if not geo or geo.get("lat") is None:
            continue

        feature = {
            "type": "Feature",
            "properties": {
                "area_code": code,
                "area_name": row.get("area_name", ""),
                "daily_max_people": int(row.get("daily_max_people", 0)),
                "daily_mean_people": round(float(row.get("daily_mean_people", 0)), 0),
                "days_observed": int(row.get("days_observed", 0)),
            },
            "geometry": {
                "type": "Point",
                "coordinates": [geo["lon"], geo["lat"]],
            },
        }
        features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features,
    }


@router.get("/fredrikstad/hourly/profile")
async def fredrikstad_hourly_profile(
    area_code: Annotated[str | None, Query(description="Filter by area_code")] = None,
    area_name: Annotated[str | None, Query(description="Filter by area_name (exact)")] = None,
) -> dict:
    """Average hourly crowd profile for an area (0-23h)."""
    df = store.telia_hourly
    if df.empty:
        raise HTTPException(status_code=503, detail="Telia hourly data not loaded")

    if area_code:
        df = df[df["area_code"] == area_code]
    elif area_name:
        df = df[df["area_name"] == area_name]
    else:
        raise HTTPException(status_code=400, detail="Provide area_code or area_name")

    if df.empty:
        raise HTTPException(status_code=404, detail="No data for this area")

    # Compute average by hour across all days
    hourly = df.groupby("hour")["people"].agg(["mean", "max", "min", "count"]).reset_index()
    hourly.columns = ["hour", "avg_people", "max_people", "min_people", "sample_count"]

    peak_hour = int(hourly.loc[hourly["avg_people"].idxmax(), "hour"])
    peak_avg = round(float(hourly["avg_people"].max()), 0)

    # Day of week pattern (0=Mon, 6=Sun)
    df_with_dow = df.copy()
    df_with_dow["dow"] = df_with_dow["batch_date"].apply(lambda d: d.weekday() if hasattr(d, 'weekday') else 0)
    daily_totals = df_with_dow.groupby("dow")["people"].mean().reset_index()
    daily_totals.columns = ["dow", "avg_people"]
    peak_dow = int(daily_totals.loc[daily_totals["avg_people"].idxmax(), "dow"])
    dow_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    return {
        "area_name": area_name or df.iloc[0]["area_name"],
        "area_code": area_code or str(df.iloc[0]["area_code"]),
        "peak_hour": peak_hour,
        "peak_avg_people": peak_avg,
        "peak_day": dow_names[peak_dow] if peak_dow < 7 else "Unknown",
        "hourly_profile": [
            {
                "hour": int(r["hour"]),
                "avg_people": round(float(r["avg_people"]), 0),
                "max_people": int(r["max_people"]),
                "min_people": int(r["min_people"]),
            }
            for _, r in hourly.iterrows()
        ],
        "daily_profile": [
            {"dow": int(r["dow"]), "day": dow_names[int(r["dow"])] if int(r["dow"]) < 7 else "?", "avg_people": round(float(r["avg_people"]), 0)}
            for _, r in daily_totals.iterrows()
        ],
    }


# ═════════════════════════════════════════════════════════════════════════════
# Zones / GeoJSON
# ═════════════════════════════════════════════════════════════════════════════


@router.get("/zones")
async def venue_zones() -> dict:
    """Return venue zones with GeoJSON geometry."""
    df = store.telcofy_areas
    if df.empty:
        raise HTTPException(status_code=503, detail="Area geometry not loaded")

    features = []
    for _, row in df.iterrows():
        geometry = None
        if row.get("geometry") is not None:
            try:
                from shapely.geometry import mapping
                geometry = mapping(row["geometry"])
            except Exception:
                pass

        feature = {
            "type": "Feature",
            "properties": {
                "id": row.get("id"),
                "area_name": row.get("area_name"),
                "area_sqm": round(row["area_sqm"], 0) if row.get("area_sqm") else None,
                "centroid_lat": row.get("centroid_lat"),
                "centroid_lon": row.get("centroid_lon"),
            },
            "geometry": geometry,
        }
        features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features,
    }
