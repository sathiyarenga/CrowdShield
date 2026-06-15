"""Document Intelligence API endpoints.

Endpoints
─────────
GET /api/documents/                   → List all uploaded documents
POST /api/documents/upload            → Upload and parse a new document
GET /api/documents/{doc_id}/extract   → Extract text from the PDF
GET /api/documents/{doc_id}/risks     → Extracted risk register
GET /api/documents/{doc_id}/gaps      → Gap analysis results
GET /api/documents/{doc_id}/entities  → Entity resolution (clusters + conflicts)
GET /api/documents/{doc_id}/summary   → Full document summary with stats
"""

from __future__ import annotations

import logging
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from src.etl.data_store import ParsedDocument, store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/documents", tags=["documents"])

UPLOAD_DIR = Path("data/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _ensure_extraction(doc_id: str) -> ParsedDocument:
    """Run the full extraction pipeline if not already cached in the store."""
    if doc_id in store.documents and store.documents[doc_id].risks is not None:
        return store.documents[doc_id]  # already cached

    # Pre-seed Galway if requested and missing
    if doc_id == "galway" and "galway" not in store.documents:
        from src.ai.pdf_extractor import GALWAY_PDF
        store.documents["galway"] = ParsedDocument(
            id="galway",
            title="GIAF THE WHALE STREET SPECTACLE 2026",
            filename="GIAF THE WHALE STREET SPECTACLE 2026 copy.pdf",
            file_path=str(GALWAY_PDF)
        )

    if doc_id not in store.documents:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")

    doc = store.documents[doc_id]
    logger.info("📄 Running document extraction pipeline for %s…", doc_id)
    t0 = time.time()

    from src.ai.pdf_extractor import extract_pages, pages_to_dict
    from src.ai.risk_extractor import extract_risks, risks_to_dicts
    from src.ai.gap_analyzer import analyze_gaps
    from src.ai.entity_resolver import resolve_entities

    # 1) PDF extraction
    pages = extract_pages(doc.file_path)
    doc.pages = pages_to_dict(pages)

    # 2) Risk extraction
    risks = extract_risks(pages)
    doc.risks = risks_to_dicts(risks)

    # 3) Gap analysis
    gap_result = analyze_gaps(risks)
    doc.gaps = gap_result.to_dict()

    # 4) Entity resolution
    entity_result = resolve_entities(risks)
    doc.entities = entity_result.to_dict()

    elapsed = time.time() - t0
    doc.processing_time = round(elapsed, 2)
    logger.info("✅ Document pipeline complete for %s in %.1fs — %d risks extracted", doc_id, elapsed, len(risks))
    
    return doc


# ═════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═════════════════════════════════════════════════════════════════════════════


@router.get("/")
async def list_documents() -> dict:
    """List all parsed documents."""
    # Ensure Galway is populated
    _ensure_extraction("galway")
    
    docs = []
    for doc in store.documents.values():
        docs.append({
            "id": doc.id,
            "title": doc.title,
            "filename": doc.filename,
            "total_risks": len(doc.risks) if doc.risks else 0,
            "processing_time_s": doc.processing_time,
        })
    return {"documents": docs}


@router.post("/upload")
async def upload_document(file: UploadFile = File(...)) -> dict:
    """Upload a new PDF for safety plan analysis."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
        
    doc_id = str(uuid.uuid4())[:8]
    file_path = UPLOAD_DIR / f"{doc_id}_{file.filename}"
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Initialise document record
    title = file.filename.replace(".pdf", "").replace("_", " ").replace("-", " ")
    store.documents[doc_id] = ParsedDocument(
        id=doc_id,
        title=title.title(),
        filename=file.filename,
        file_path=str(file_path)
    )
    
    # Run parsing
    _ensure_extraction(doc_id)
    
    return {"status": "success", "document_id": doc_id}


@router.get("/{doc_id}/extract")
async def document_extract(
    doc_id: str,
    page: Annotated[int | None, Query(ge=1, description="Filter to a specific page")] = None,
) -> dict:
    """Extract text from the PDF."""
    doc = _ensure_extraction(doc_id)

    pages = doc.pages
    if pages is None:
        raise HTTPException(status_code=503, detail="Document extraction not available")

    if page is not None:
        pages = [p for p in pages if p["page_number"] == page]
        if not pages:
            raise HTTPException(status_code=404, detail=f"Page {page} not found")

    return {
        "document": doc.title,
        "total_pages": len(doc.pages) if doc.pages else 0,
        "returned_pages": len(pages),
        "processing_time_s": doc.processing_time,
        "pages": pages,
    }


@router.get("/{doc_id}/risks")
async def document_risks(
    doc_id: str,
    category: Annotated[str | None, Query(description="Filter by hazard category")] = None,
    min_score: Annotated[int | None, Query(ge=1, le=25, description="Minimum risk score")] = None,
    page: Annotated[int | None, Query(ge=1, description="Filter by source page")] = None,
    mode: Annotated[str | None, Query(description="Filter by extraction mode")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> dict:
    """Get the extracted risk register from the plan."""
    doc = _ensure_extraction(doc_id)

    risks = doc.risks
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
        "document": doc.title,
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


@router.get("/{doc_id}/gaps")
async def document_gaps(doc_id: str) -> dict:
    """Get gap analysis results for the event plan."""
    doc = _ensure_extraction(doc_id)

    gaps = doc.gaps
    if gaps is None:
        raise HTTPException(status_code=503, detail="Gap analysis not available")

    return {
        "document": doc.title,
        "gap_analysis": gaps,
    }


@router.get("/{doc_id}/entities")
async def document_entities(
    doc_id: str,
    theme: Annotated[str | None, Query(description="Filter clusters by theme")] = None,
) -> dict:
    """Get entity resolution results: risk clusters and conflicts."""
    doc = _ensure_extraction(doc_id)

    entities = doc.entities
    if entities is None:
        raise HTTPException(status_code=503, detail="Entity resolution not available")

    result = dict(entities)
    if theme:
        result["clusters"] = [
            c for c in result.get("clusters", []) if theme in c.get("theme", "")
        ]

    return {
        "document": doc.title,
        "entity_resolution": result,
    }


@router.get("/{doc_id}/summary")
async def document_summary(doc_id: str) -> dict:
    """Full document intelligence summary with all stats."""
    doc = _ensure_extraction(doc_id)

    pages = doc.pages or []
    risks = doc.risks or []
    gaps = doc.gaps or {}
    entities = doc.entities or {}

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
            "title": doc.title,
            "filename": doc.filename,
            "total_pages": len(pages),
            "total_words": total_words,
            "pages_with_tables": pages_with_tables,
            "processing_time_s": doc.processing_time,
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
