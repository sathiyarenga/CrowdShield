"""In-memory data store for the CrowdShield MVP.

All ETL loaders write into this singleton so FastAPI endpoints
can serve data without a running database.
"""

from __future__ import annotations

import pandas as pd


class DataStore:
    """Singleton holding all loaded DataFrames in memory."""

    _instance: DataStore | None = None

    def __new__(cls) -> DataStore:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialised = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialised:
            return
        self._initialised = True

        # ── Telia (Fredrikstad) ─────────────────────────────────────────
        self.telia_daily: pd.DataFrame = pd.DataFrame()
        self.telia_hourly: pd.DataFrame = pd.DataFrame()
        self.telia_areas: pd.DataFrame = pd.DataFrame()  # distinct areas

        # ── Telcofy (Ullevaal) ──────────────────────────────────────────
        self.telcofy_summary: pd.DataFrame = pd.DataFrame()
        self.telcofy_breakdown: pd.DataFrame = pd.DataFrame()
        self.telcofy_areas: pd.DataFrame = pd.DataFrame()

        # ── Analytics artefacts ─────────────────────────────────────────
        self.ullevaal_baselines: pd.DataFrame = pd.DataFrame()
        self.ullevaal_fingerprints: pd.DataFrame = pd.DataFrame()
        self.fredrikstad_baselines: pd.DataFrame = pd.DataFrame()

        # ── Document Intelligence (AI module) ──────────────────────────
        self.doc_pages: list[dict] | None = None
        self.doc_risks: list[dict] | None = None
        self.doc_gaps: dict | None = None
        self.doc_entities: dict | None = None
        self.doc_processing_time: float = 0.0

        # ── Risk & Benchmarking (Phase 2 Week 4) ──────────────────────
        self.composite_risk_cache: dict[str, dict] = {}  # date → result
        self.benchmark_cache: dict | None = None

    def is_loaded(self) -> bool:
        """Return True if at least one dataset has been loaded."""
        return not self.telcofy_summary.empty or not self.telia_daily.empty


# Module-level singleton
store = DataStore()
