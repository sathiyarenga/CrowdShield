"""Stakeholder auto-identification from document content.

Scans the first few pages of a document for keywords that indicate
which stakeholder authored or submitted the document.  This is a
rule-based approach that matches organization names, roles, and
domain-specific terminology against a known stakeholder registry.
"""

from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


# ── Stakeholder keyword profiles ────────────────────────────────────────
# Each profile maps a stakeholder_id to keywords found in their documents.
# Scored by frequency: more matches = higher confidence.

STAKEHOLDER_PROFILES: list[dict[str, Any]] = [
    {
        "id": "giaf",
        "name": "GIAF",
        "role": "Event Organiser",
        "icon": "🎭",
        "expected_document": "Event Management Plan",
        "keywords": [
            r"galway\s+international\s+arts\s+festival",
            r"\bgiaf\b",
            r"event\s+management\s+plan",
            r"event\s+organiser",
            r"whale\s+street\s+spectacle",
            r"arts\s+festival",
            r"parade\s+route",
            r"street\s+performance",
        ],
    },
    {
        "id": "galway_council",
        "name": "Galway City Council",
        "role": "Municipality",
        "icon": "🏛️",
        "expected_document": "City Risk Register",
        "keywords": [
            r"galway\s+city\s+council",
            r"city\s+council",
            r"municipal",
            r"local\s+authority",
            r"city\s+risk\s+register",
            r"planning\s+permission",
            r"road\s+closure",
        ],
    },
    {
        "id": "gardai",
        "name": "An Garda Síochána",
        "role": "Police",
        "icon": "👮",
        "expected_document": "Tactical Plan",
        "keywords": [
            r"garda",
            r"garda[ií]",
            r"an\s+garda",
            r"garda\s+s[ií]och[aá]na",
            r"tactical\s+plan",
            r"policing\s+plan",
            r"public\s+order",
        ],
    },
    {
        "id": "nas",
        "name": "National Ambulance Service",
        "role": "EMS",
        "icon": "🚑",
        "expected_document": "Medical Response Plan",
        "keywords": [
            r"national\s+ambulance",
            r"\bnas\b",
            r"medical\s+response\s+plan",
            r"ambulance\s+service",
            r"pre-?hospital",
            r"paramedic",
            r"first\s+aid\s+plan",
        ],
    },
    {
        "id": "fire_service",
        "name": "Galway Fire & Rescue",
        "role": "Fire Service",
        "icon": "🚒",
        "expected_document": "Fire Safety Plan",
        "keywords": [
            r"fire\s+(?:and|&)\s+rescue",
            r"fire\s+service",
            r"fire\s+brigade",
            r"fire\s+safety\s+plan",
            r"fire\s+safety\s+certificate",
            r"fire\s+officer",
            r"means\s+of\s+escape",
        ],
    },
]


def identify_stakeholder(pages: list[dict], top_n_pages: int = 5) -> tuple[str | None, float]:
    """Identify which stakeholder authored a document.

    Scans the first `top_n_pages` pages for keyword matches against
    known stakeholder profiles.

    Returns:
        (stakeholder_id, confidence) where confidence is 0.0–1.0.
        Returns (None, 0.0) if no match exceeds the threshold.
    """
    # Concatenate text from the first few pages (title pages, headers)
    text_chunks: list[str] = []
    for page in pages[:top_n_pages]:
        raw = page.get("raw_text") or page.get("cleaned_text") or ""
        text_chunks.append(raw.lower())
    combined_text = "\n".join(text_chunks)

    if not combined_text.strip():
        return None, 0.0

    scores: dict[str, int] = {}
    for profile in STAKEHOLDER_PROFILES:
        score = 0
        for pattern in profile["keywords"]:
            matches = re.findall(pattern, combined_text, re.IGNORECASE)
            score += len(matches)
        scores[profile["id"]] = score

    if not scores or max(scores.values()) == 0:
        return None, 0.0

    best_id = max(scores, key=scores.get)  # type: ignore[arg-type]
    best_score = scores[best_id]

    # Confidence: normalize by number of keywords in the profile
    best_profile = next(p for p in STAKEHOLDER_PROFILES if p["id"] == best_id)
    max_possible = len(best_profile["keywords"]) * 3  # assume max 3 hits per keyword
    confidence = min(best_score / max(max_possible, 1), 1.0)

    # Require minimum confidence
    if confidence < 0.05:
        logger.info("Stakeholder identification: no confident match (best: %s at %.0f%%)", best_id, confidence * 100)
        return None, 0.0

    logger.info(
        "Stakeholder identified: %s (%s) with confidence %.0f%% (%d keyword matches)",
        best_id, best_profile["name"], confidence * 100, best_score,
    )
    return best_id, round(confidence, 2)


def get_stakeholder_profile(stakeholder_id: str) -> dict[str, Any] | None:
    """Look up a stakeholder profile by ID."""
    return next((p for p in STAKEHOLDER_PROFILES if p["id"] == stakeholder_id), None)


def all_stakeholder_profiles() -> list[dict[str, Any]]:
    """Return all known stakeholder profiles (without keywords)."""
    return [
        {
            "id": p["id"],
            "name": p["name"],
            "role": p["role"],
            "icon": p["icon"],
            "expected_document": p["expected_document"],
        }
        for p in STAKEHOLDER_PROFILES
    ]
