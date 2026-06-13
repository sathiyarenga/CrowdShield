"""CrowdShield FastAPI application entry point.

Run with:
    uvicorn src.api.main:app --reload --port 8000

Or:
    python -m src.api.main
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes.analytics import router as analytics_router
from src.api.routes.documents import router as documents_router
from src.api.routes.health import router as health_router
from src.api.routes.risk import router as risk_router
from src.api.routes.spatial import router as spatial_router
from src.api.routes.simulation import router as simulation_router
from src.api.routes.stakeholders import router as stakeholders_router
from src.api.routes.venues import router as venues_router
from src.analytics.baseline import compute_fredrikstad_baselines, compute_ullevaal_baseline
from src.analytics.event_fingerprint import compute_all_fingerprints
from src.etl.telcofy_loader import load_all as load_telcofy
from src.etl.telia_loader import load_all as load_telia

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: load data on startup."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    )
    logger.info("🚀 CrowdShield backend starting — loading data…")

    # ── ETL ──────────────────────────────────────────────────────────
    load_telcofy()
    load_telia()

    # ── Analytics ────────────────────────────────────────────────────
    compute_ullevaal_baseline()
    compute_fredrikstad_baselines()
    compute_all_fingerprints()

    # ── Document Intelligence (lazy — just log availability) ──────
    try:
        from src.ai.pdf_extractor import GALWAY_PDF
        if GALWAY_PDF.exists():
            logger.info("📄 Galway PDF found — document extraction available at /api/documents/galway/")
        else:
            logger.warning("⚠️  Galway PDF not found at %s — document endpoints will return 503", GALWAY_PDF)
    except Exception as exc:
        logger.warning("⚠️  Document intelligence module not available: %s", exc)

    logger.info("✅ All data loaded and analytics computed. Server ready.")
    yield
    logger.info("🛑 CrowdShield backend shutting down.")


app = FastAPI(
    title="CrowdShield API",
    description="Event Risk Intelligence Platform — real-time crowd analytics",
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",    # Next.js dev
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "https://crowd-shield-iota.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ───────────────────────────────────────────────────────────────
app.include_router(health_router)
app.include_router(analytics_router)
app.include_router(documents_router)
app.include_router(risk_router)
app.include_router(spatial_router)
app.include_router(simulation_router)
app.include_router(stakeholders_router)
app.include_router(venues_router)


@app.get("/", include_in_schema=False)
async def root():
    """Root redirect to docs."""
    return {
        "service": "CrowdShield API",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/api/health",
    }


# ── Standalone runner ────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
