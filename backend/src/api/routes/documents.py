"""Document Intelligence API endpoints.

Endpoints
─────────
GET /api/documents/galway/extract     → Extract text from the Galway PDF (cached)
GET /api/documents/galway/risks       → Extracted risk register
GET /api/documents/galway/gaps        → Gap analysis results
GET /api/documents/galway/entities    → Entity resolution (clusters + conflicts)
GET /api/documents/galway/summary     → Full document summary with stats
"""

from __future__ import annotations

import logging
import time
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from src.etl.data_store import store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/documents", tags=["documents"])


def _ensure_extraction() -> None:
    """Run the full extraction pipeline if not already cached in the store."""
    if store.doc_risks is not None:
        return  # already cached

    logger.info("📄 First request — running document extraction pipeline…")
    t0 = time.time()

    from src.ai.pdf_extractor import extract_pages, pages_to_dict
    from src.ai.risk_extractor import extract_risks, risks_to_dicts
    from src.ai.gap_analyzer import analyze_gaps
    from src.ai.entity_resolver import resolve_entities

    # 1) PDF extraction
    pages = extract_pages()
    store.doc_pages = pages_to_dict(pages)

    # 2) Risk extraction
    risks = extract_risks(pages)
    store.doc_risks = risks_to_dicts(risks)

    # 3) Gap analysis
    gap_result = analyze_gaps(risks)
    store.doc_gaps = gap_result.to_dict()

    # 4) Entity resolution
    entity_result = resolve_entities(risks)
    store.doc_entities = entity_result.to_dict()

    elapsed = time.time() - t0
    store.doc_processing_time = round(elapsed, 2)
    logger.info("✅ Document pipeline complete in %.1fs — %d risks extracted", elapsed, len(risks))


# ═════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═════════════════════════════════════════════════════════════════════════════


@router.get("/galway/extract")
async def galway_extract(
    page: Annotated[int | None, Query(ge=1, description="Filter to a specific page")] = None,
) -> dict:
    """Extract text from the Galway event plan PDF.

    Results are cached after the first extraction.
    """
    _ensure_extraction()

    pages = store.doc_pages
    if pages is None:
        raise HTTPException(status_code=503, detail="Document extraction not available")

    if page is not None:
        pages = [p for p in pages if p["page_number"] == page]
        if not pages:
            raise HTTPException(status_code=404, detail=f"Page {page} not found")

    return {
        "document": "GIAF THE WHALE STREET SPECTACLE 2026",
        "total_pages": len(store.doc_pages) if store.doc_pages else 0,
        "returned_pages": len(pages),
        "processing_time_s": store.doc_processing_time,
        "pages": pages,
    }


@router.get("/galway/risks")
async def galway_risks(
    category: Annotated[str | None, Query(description="Filter by hazard category")] = None,
    min_score: Annotated[int | None, Query(ge=1, le=25, description="Minimum risk score")] = None,
    page: Annotated[int | None, Query(ge=1, description="Filter by source page")] = None,
    mode: Annotated[str | None, Query(description="Filter by extraction mode")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> dict:
    """Get the extracted risk register from the Galway event plan."""
    _ensure_extraction()

    risks = store.doc_risks
    if risks is None:
        raise HTTPException(status_code=503, detail="Risk extraction not available")

    # Apply filters
    filtered = list(risks)
    if category:
        filtered = [r for r in filtered if r["hazard_category"] == category]
    if min_score is not None:
        filtered = [r for r in filtered if (r.get("risk_score") or 0) >= min_score]
    if page is not None:
        filtered = [r for r in filtered if r["source_page"] == page]
    if mode:
        filtered = [r for r in filtered if mode in r.get("extraction_mode", "")]

    total = len(filtered)
    filtered = filtered[:limit]

    # Summary stats
    from collections import Counter
    all_risks = list(risks)
    cat_counts = Counter(r["hazard_category"] for r in all_risks)
    mode_counts = Counter(r["extraction_mode"] for r in all_risks)
    scored = [r for r in all_risks if r.get("risk_score")]
    avg_score = sum(r["risk_score"] for r in scored) / len(scored) if scored else 0

    return {
        "document": "GIAF THE WHALE STREET SPECTACLE 2026",
        "total_risks": len(all_risks),
        "filtered_count": total,
        "returned": len(filtered),
        "summary": {
            "by_category": dict(cat_counts.most_common()),
            "by_extraction_mode": dict(mode_counts),
            "scored_risks": len(scored),
            "average_score": round(avg_score, 1),
        },
        "risks": filtered,
    }


@router.get("/galway/gaps")
async def galway_gaps() -> dict:
    """Get gap analysis results for the Galway event plan."""
    _ensure_extraction()

    gaps = store.doc_gaps
    if gaps is None:
        raise HTTPException(status_code=503, detail="Gap analysis not available")

    return {
        "document": "GIAF THE WHALE STREET SPECTACLE 2026",
        "gap_analysis": gaps,
    }


@router.get("/galway/entities")
async def galway_entities(
    theme: Annotated[str | None, Query(description="Filter clusters by theme")] = None,
) -> dict:
    """Get entity resolution results: risk clusters and conflicts."""
    _ensure_extraction()

    entities = store.doc_entities
    if entities is None:
        raise HTTPException(status_code=503, detail="Entity resolution not available")

    result = dict(entities)
    if theme:
        result["clusters"] = [
            c for c in result.get("clusters", []) if theme in c.get("theme", "")
        ]

    return {
        "document": "GIAF THE WHALE STREET SPECTACLE 2026",
        "entity_resolution": result,
    }


@router.get("/galway/summary")
async def galway_summary() -> dict:
    """Full document intelligence summary with all stats."""
    _ensure_extraction()

    pages = store.doc_pages or []
    risks = store.doc_risks or []
    gaps = store.doc_gaps or {}
    entities = store.doc_entities or {}

    # Page statistics
    total_words = sum(p.get("word_count", 0) for p in pages)
    pages_with_tables = sum(1 for p in pages if p.get("has_table"))

    # Risk breakdown
    from collections import Counter
    cat_counts = Counter(r["hazard_category"] for r in risks)
    scored = [r for r in risks if r.get("risk_score")]
    high_risks = [r for r in risks if (r.get("risk_score") or 0) >= 10]

    # Top risks by score
    top_risks = sorted(risks, key=lambda r: -(r.get("risk_score") or 0))[:10]

    return {
        "document": {
            "title": "GIAF THE WHALE STREET SPECTACLE 2026",
            "filename": "GIAF THE WHALE STREET SPECTACLE 2026 copy.pdf",
            "total_pages": len(pages),
            "total_words": total_words,
            "pages_with_tables": pages_with_tables,
            "processing_time_s": store.doc_processing_time,
        },
        "risk_register": {
            "total_risks": len(risks),
            "scored_risks": len(scored),
            "high_risks": len(high_risks),
            "average_score": round(
                sum(r["risk_score"] for r in scored) / len(scored) if scored else 0, 1
            ),
            "max_score": max((r.get("risk_score") or 0) for r in risks) if risks else 0,
            "by_category": dict(cat_counts.most_common()),
            "top_risks": [
                {
                    "id": r["id"],
                    "title": r["title"][:80],
                    "score": r.get("risk_score"),
                    "category": r["hazard_category"],
                    "page": r["source_page"],
                }
                for r in top_risks
            ],
        },
        "gap_analysis": {
            "completeness_score": gaps.get("completeness_score", 0),
            "overall_status": gaps.get("overall_status", "unknown"),
            "categories_covered": gaps.get("categories_covered", 0),
            "categories_total": gaps.get("categories_total", 8),
            "categories_with_gaps": gaps.get("categories_with_gaps", 0),
            "uncovered_categories": gaps.get("uncovered_categories", []),
            "top_recommendations": gaps.get("top_recommendations", [])[:5],
        },
        "entity_resolution": {
            "total_clusters": entities.get("total_clusters", 0),
            "cross_page_references": entities.get("cross_page_references", 0),
            "total_conflicts": entities.get("total_conflicts", 0),
            "conflicts": entities.get("conflicts", [])[:5],
        },
    }
