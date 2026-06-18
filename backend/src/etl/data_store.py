"""In-memory data store for the CrowdShield MVP.

All ETL loaders write into this singleton so FastAPI endpoints
can serve data without a running database.
"""

from __future__ import annotations

import pandas as pd
from dataclasses import dataclass, field
from typing import Any

@dataclass
class ParsedDocument:
    id: str
    title: str
    filename: str
    file_path: str
    pages: list[dict] | None = None
    risks: list[dict] | None = None
    gaps: dict | None = None
    entities: dict | None = None
    processing_time: float = 0.0
    stakeholder_id: str | None = None      # auto-identified from content



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

        # ── Document Intelligence (unified store) ───────────────────────
        # All documents — uploaded or pre-seeded — live here.
        # Stakeholder matrix reads from this same dict.
        self.documents: dict[str, ParsedDocument] = {}

        # ── Risk & Benchmarking (Phase 2 Week 4) ──────────────────────
        self.composite_risk_cache: dict[str, dict] = {}  # date → result
        self.benchmark_cache: dict | None = None

    # ── Convenience helpers ─────────────────────────────────────────────

    def all_risks(self) -> list[dict]:
        """Aggregate risks from ALL uploaded/parsed documents."""
        result: list[dict] = []
        for doc in self.documents.values():
            if doc.risks:
                result.extend(doc.risks)
        return result

    def submitted_documents(self) -> list[ParsedDocument]:
        """Return documents that have been fully processed (have risks)."""
        return [d for d in self.documents.values() if d.risks is not None]

    def is_loaded(self) -> bool:
        """Return True if at least one dataset has been loaded."""
        return not self.telcofy_summary.empty or not self.telia_daily.empty


# Module-level singleton
store = DataStore()
