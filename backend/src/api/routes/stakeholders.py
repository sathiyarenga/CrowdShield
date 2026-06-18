"""Multi-Stakeholder Intelligence API endpoints.

Endpoints
─────────
GET /api/stakeholders/              → List all stakeholders with document status
GET /api/stakeholders/matrix        → Risk coverage matrix (stakeholders × hazard categories)
GET /api/stakeholders/actions       → Recommended actions derived from real data
GET /api/stakeholders/coverage-summary → Top-level coverage stats for dashboard cards
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter

from src.etl.data_store import store
from src.ai.stakeholder_identifier import (
    all_stakeholder_profiles,
    STAKEHOLDER_PROFILES,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stakeholders", tags=["stakeholders"])


# Canonical hazard categories — matches the risk extractor's taxonomy.
HAZARD_CATEGORIES: list[str] = [
    "crowd_crush",
    "fire",
    "weather",
    "security",
    "medical",
    "infrastructure",
    "traffic",
    "environmental",
]

# Pretty labels for category names.
CATEGORY_LABELS: dict[str, str] = {
    "crowd_crush": "Crowd Crush",
    "fire": "Fire",
    "weather": "Weather",
    "security": "Security",
    "medical": "Medical",
    "infrastructure": "Infrastructure",
    "traffic": "Traffic",
    "environmental": "Environmental",
}


# ═════════════════════════════════════════════════════════════════════════════
# Internal helpers — read from unified store.documents
# ═════════════════════════════════════════════════════════════════════════════


def _ensure_galway_loaded() -> None:
    """Auto-seed the pre-bundled Galway PDF if not already loaded.

    This acts as seed data — equivalent to a user uploading the document.
    On a production PaaS, this would not exist; users upload all documents.
    """
    if "galway" in store.documents:
        return

    from src.api.routes.documents import _ensure_extraction
    _ensure_extraction("galway")


def _stakeholder_profiles_with_status() -> list[dict[str, Any]]:
    """Return stakeholder profiles with live document_status derived from store.documents."""
    profiles = all_stakeholder_profiles()

    # Map: stakeholder_id → list of doc_ids
    docs_by_stakeholder: dict[str, list[str]] = {}
    for doc in store.documents.values():
        if doc.stakeholder_id and doc.risks is not None:
            docs_by_stakeholder.setdefault(doc.stakeholder_id, []).append(doc.id)

    for p in profiles:
        doc_ids = docs_by_stakeholder.get(p["id"], [])
        p["document_status"] = "submitted" if doc_ids else "pending"
        p["document_ids"] = doc_ids
        p["document_count"] = len(doc_ids)

    return profiles


def _risks_by_category() -> dict[str, list[dict]]:
    """Group ALL extracted risks (from all documents) by hazard_category."""
    all_risks = store.all_risks()
    grouped: dict[str, list[dict]] = {cat: [] for cat in HAZARD_CATEGORIES}
    for r in all_risks:
        cat = r.get("hazard_category", "")
        if cat in grouped:
            grouped[cat].append(r)
    return grouped


def _risks_for_stakeholder(stakeholder_id: str) -> list[dict]:
    """Get risks from documents attributed to a specific stakeholder."""
    risks: list[dict] = []
    for doc in store.documents.values():
        if doc.stakeholder_id == stakeholder_id and doc.risks:
            risks.extend(doc.risks)
    return risks


def _risks_for_stakeholder_by_category(stakeholder_id: str) -> dict[str, list[dict]]:
    """Group a stakeholder's risks by hazard category."""
    risks = _risks_for_stakeholder(stakeholder_id)
    grouped: dict[str, list[dict]] = {cat: [] for cat in HAZARD_CATEGORIES}
    for r in risks:
        cat = r.get("hazard_category", "")
        if cat in grouped:
            grouped[cat].append(r)
    return grouped


def _category_stats(risks: list[dict]) -> dict[str, Any]:
    """Compute summary stats for a list of risks in one category."""
    scored = [r for r in risks if r.get("risk_score")]
    avg = round(sum(r["risk_score"] for r in scored) / len(scored), 1) if scored else 0.0
    top = max(risks, key=lambda r: r.get("risk_score", 0) or 0, default=None)
    return {
        "risk_count": len(risks),
        "avg_score": avg,
        "top_risk": top["title"][:80] if top else None,
        "top_score": top.get("risk_score") if top else None,
    }


# ═════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═════════════════════════════════════════════════════════════════════════════


@router.get("/")
async def list_stakeholders() -> dict:
    """List all stakeholders with their document submission status (live)."""
    _ensure_galway_loaded()

    return {
        "event": "Galway International Arts Festival 2026",
        "stakeholders": _stakeholder_profiles_with_status(),
    }


@router.get("/matrix")
async def stakeholder_matrix() -> dict:
    """Multi-stakeholder risk alignment matrix.

    Reads from store.documents — the SAME data that Document Intelligence
    uploads into. Each stakeholder's column shows coverage from documents
    auto-attributed to them.
    """
    _ensure_galway_loaded()
    stakeholders = _stakeholder_profiles_with_status()
    submitted_ids = {s["id"] for s in stakeholders if s["document_status"] == "submitted"}

    # Build the matrix: rows = categories, cols = stakeholders
    matrix: dict[str, dict[str, dict]] = {}
    for cat in HAZARD_CATEGORIES:
        row: dict[str, dict] = {}
        for sh in stakeholders:
            if sh["id"] in submitted_ids:
                # Get risks from THIS stakeholder's documents in THIS category
                sh_cat_risks = _risks_for_stakeholder_by_category(sh["id"]).get(cat, [])
                if sh_cat_risks:
                    stats = _category_stats(sh_cat_risks)
                    row[sh["id"]] = {
                        "status": "covered",
                        "risk_count": stats["risk_count"],
                        "avg_score": stats["avg_score"],
                        "top_risk": stats["top_risk"],
                        "top_score": stats["top_score"],
                    }
                else:
                    row[sh["id"]] = {"status": "gap"}
            else:
                row[sh["id"]] = {"status": "no_document"}
        matrix[cat] = row

    # Coverage gaps: categories with ≤2 risks across all documents
    by_cat = _risks_by_category()
    coverage_gaps: list[dict[str, Any]] = []
    for cat in HAZARD_CATEGORIES:
        count = len(by_cat[cat])
        if count <= 2:
            coverage_gaps.append({
                "category": cat,
                "label": CATEGORY_LABELS.get(cat, cat),
                "risk_count": count,
                "severity": "critical" if count == 0 else "weak",
            })

    # Alignment summary
    submitted_count = len(submitted_ids)
    if submitted_count >= 2:
        alignment_summary = {
            "status": "active",
            "message": f"Cross-validation active across {submitted_count} documents",
        }
    else:
        alignment_summary = {
            "status": "insufficient_data",
            "message": f"Multi-stakeholder alignment requires ≥2 submitted documents. Currently {submitted_count} of {len(stakeholders)} submitted.",
        }

    # System insights
    system_insights = _generate_insights(by_cat, stakeholders)

    return {
        "event": "Galway International Arts Festival 2026",
        "categories": [
            {"id": cat, "label": CATEGORY_LABELS.get(cat, cat)} for cat in HAZARD_CATEGORIES
        ],
        "stakeholders": stakeholders,
        "matrix": matrix,
        "alignment_summary": alignment_summary,
        "coverage_gaps": coverage_gaps,
        "system_insights": system_insights,
    }


def _generate_insights(by_cat: dict[str, list[dict]], stakeholders: list[dict]) -> list[dict[str, str]]:
    """Generate platform insights based on actual extracted data."""
    insights: list[dict[str, str]] = []
    submitted = [s for s in stakeholders if s["document_status"] == "submitted"]
    pending = [s for s in stakeholders if s["document_status"] == "pending"]

    # Sort categories by risk count for insight generation
    sorted_cats = sorted(by_cat.items(), key=lambda x: len(x[1]), reverse=True)

    # Insight 1: strongest coverage
    if sorted_cats and len(sorted_cats[0][1]) > 0:
        top_cat, top_risks = sorted_cats[0]
        insights.append({
            "type": "strength",
            "priority": "info",
            "message": (
                f"Strongest coverage in {CATEGORY_LABELS.get(top_cat, top_cat).lower()} "
                f"({len(top_risks)} risks across {len(submitted)} document{'s' if len(submitted) != 1 else ''})"
            ),
        })

    # Insight 2: weakest categories
    weak_cats = [(cat, risks) for cat, risks in sorted_cats if len(risks) <= 2]
    for cat, risks in weak_cats:
        label = CATEGORY_LABELS.get(cat, cat)
        relevant_sh = _relevant_stakeholder_for_category(cat, stakeholders)
        if relevant_sh and relevant_sh["document_status"] == "pending":
            insights.append({
                "type": "coverage_warning",
                "priority": "high",
                "message": (
                    f"{label} has only {len(risks)} identified risk{'s' if len(risks) != 1 else ''} "
                    f"— consider requesting detailed plan from {relevant_sh['name']}"
                ),
            })
        else:
            insights.append({
                "type": "coverage_warning",
                "priority": "medium",
                "message": (
                    f"{label} coverage is weak with only {len(risks)} risk{'s' if len(risks) != 1 else ''} identified"
                ),
            })

    # Insight 3: cross-validation status
    if len(pending) > 0:
        insights.append({
            "type": "cross_validation",
            "priority": "medium",
            "message": (
                f"{len(pending)} of {len(stakeholders)} stakeholder documents pending "
                f"— multi-party conflict detection will activate when ≥2 documents are submitted"
            ),
        })

    # Insight 4: pending document requests
    for sh in pending:
        insights.append({
            "type": "pending_document",
            "priority": "low",
            "message": f"Awaiting {sh['expected_document']} from {sh['name']} ({sh['role']})",
        })

    return insights


def _relevant_stakeholder_for_category(category: str, stakeholders: list[dict]) -> dict | None:
    """Find the most relevant pending stakeholder for a weak category."""
    mapping: dict[str, str] = {
        "fire": "fire_service",
        "security": "gardai",
        "medical": "nas",
        "crowd_crush": "gardai",
        "traffic": "galway_council",
        "environmental": "galway_council",
        "infrastructure": "galway_council",
        "weather": "nas",
    }
    target_id = mapping.get(category)
    if not target_id:
        return None
    return next((s for s in stakeholders if s["id"] == target_id), None)


@router.get("/actions")
async def recommended_actions() -> dict:
    """Recommended actions generated from ACTUAL gap analysis data."""
    _ensure_galway_loaded()
    stakeholders = _stakeholder_profiles_with_status()
    by_cat = _risks_by_category()

    actions: list[dict[str, Any]] = []
    action_num = 0

    # Action from weak categories (≤2 risks)
    weak_cats = [
        (cat, risks) for cat, risks in by_cat.items() if len(risks) <= 2
    ]
    weak_cats.sort(key=lambda x: len(x[1]))

    for cat, risks in weak_cats:
        action_num += 1
        label = CATEGORY_LABELS.get(cat, cat)
        count = len(risks)
        relevant = _relevant_stakeholder_for_category(cat, stakeholders)

        if count == 0:
            desc = f"No risks identified for {label}. This is a critical gap in the event risk register."
            priority = "critical"
        elif count <= 2:
            desc = f"Only {count} risk{'s' if count != 1 else ''} identified for {label}."
            priority = "high"
        else:
            desc = f"{label} has {count} risks."
            priority = "medium"

        if relevant and relevant["document_status"] == "pending":
            desc += f" Request {relevant['expected_document']} from {relevant['name']} to strengthen coverage."

        actions.append({
            "number": action_num,
            "title": f"Strengthen {label} Coverage",
            "description": desc,
            "priority": priority,
            "category": cat,
            "current_risk_count": count,
            "relevant_stakeholder": relevant["id"] if relevant else None,
        })

    # Actions for missing stakeholder documents
    pending = [s for s in stakeholders if s["document_status"] == "pending"]
    for sh in pending:
        action_num += 1
        actions.append({
            "number": action_num,
            "title": f"Request {sh['expected_document']}",
            "description": (
                f"{sh['name']} ({sh['role']}) has not yet submitted their "
                f"{sh['expected_document']}. Cross-validation requires ≥2 documents."
            ),
            "priority": "medium",
            "category": None,
            "current_risk_count": None,
            "relevant_stakeholder": sh["id"],
        })

    # Cross-validation action
    submitted_count = sum(1 for s in stakeholders if s["document_status"] == "submitted")
    if submitted_count < 2:
        action_num += 1
        actions.append({
            "number": action_num,
            "title": "Enable Cross-Validation",
            "description": (
                f"Currently {submitted_count} of {len(stakeholders)} documents submitted. "
                "Multi-stakeholder conflict detection requires at least 2 documents. "
                "Prioritise collection of documents from key stakeholders."
            ),
            "priority": "high",
            "category": None,
            "current_risk_count": None,
            "relevant_stakeholder": None,
        })

    return {
        "event": "Galway International Arts Festival 2026",
        "total_actions": len(actions),
        "actions": actions,
    }


@router.get("/coverage-summary")
async def coverage_summary() -> dict:
    """Top-level coverage stats for the dashboard summary cards."""
    _ensure_galway_loaded()
    stakeholders = _stakeholder_profiles_with_status()
    by_cat = _risks_by_category()

    total_stakeholders = len(stakeholders)
    submitted = sum(1 for s in stakeholders if s["document_status"] == "submitted")
    pending = total_stakeholders - submitted

    # Category coverage stats
    total_categories = len(HAZARD_CATEGORIES)
    fully_covered = sum(1 for risks in by_cat.values() if len(risks) >= 5)
    categories_covered = sum(1 for risks in by_cat.values() if len(risks) > 0)
    weak_categories = sum(1 for risks in by_cat.values() if 0 < len(risks) <= 2)
    empty_categories = sum(1 for risks in by_cat.values() if len(risks) == 0)

    # Total risk stats — aggregated from ALL documents
    all_risks = store.all_risks()
    scored = [r for r in all_risks if r.get("risk_score")]
    avg_score = round(sum(r["risk_score"] for r in scored) / len(scored), 1) if scored else 0.0

    cross_validation_ready = submitted >= 2

    return {
        "event": "Galway International Arts Festival 2026",
        "documents_submitted": submitted,
        "documents_expected": total_stakeholders,
        "categories_covered": categories_covered,
        "categories_fully_covered": fully_covered,
        "categories_total": total_categories,
        "categories_weak": weak_categories,
        "categories_empty": empty_categories,
        "pending_stakeholders": pending,
        "cross_validation_ready": cross_validation_ready,
        "total_risks_extracted": len(all_risks),
        "scored_risks": len(scored),
        "average_risk_score": avg_score,
    }
