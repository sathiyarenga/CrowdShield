"""Risk extraction from PDF text — dual-mode: rule-based (default) + optional LLM.

Mode A (Rule-based):  Always available.  Uses regex, keyword matching and
    table-row parsing to extract structured risks from event safety PDFs.
Mode B (LLM / Gemini):  Activated when GOOGLE_API_KEY env var is set.
    Uses Gemini to do structured extraction with higher accuracy.

Run standalone:
    python -m src.ai.risk_extractor
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
from dataclasses import dataclass, field
from typing import Any

from src.ai.pdf_extractor import PageContent, extract_pages

logger = logging.getLogger(__name__)

# ═════════════════════════════════════════════════════════════════════════════
# Data model
# ═════════════════════════════════════════════════════════════════════════════

HAZARD_CATEGORIES = [
    "crowd_crush",
    "fire",
    "weather",
    "security",
    "medical",
    "infrastructure",
    "traffic",
    "environmental",
]

_LIKELIHOOD_MAP: dict[str, str] = {
    "1": "low", "2": "medium", "3": "high", "4": "very_high", "5": "very_high",
    "low": "low", "medium": "medium", "high": "high",
    "very high": "very_high", "very_high": "very_high",
    "unlikely": "low", "possible": "medium", "likely": "high",
    "almost certain": "very_high", "rare": "low",
}

_CONSEQUENCE_MAP: dict[str, str] = {
    "1": "minor", "2": "minor", "3": "moderate", "4": "major", "5": "catastrophic",
    "minor": "minor", "moderate": "moderate", "major": "major",
    "catastrophic": "catastrophic", "insignificant": "minor",
    "negligible": "minor", "severe": "major", "critical": "catastrophic",
}


@dataclass
class ExtractedRisk:
    """A single risk extracted from the document."""
    id: str
    hazard_category: str
    title: str
    description: str
    likelihood: str
    consequence: str
    risk_score: int | None = None
    controls: list[str] = field(default_factory=list)
    spatial_reference: str | None = None
    source_page: int = 0
    source_text: str = ""
    confidence: float = 0.0
    extraction_mode: str = "rule_based"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "hazard_category": self.hazard_category,
            "title": self.title,
            "description": self.description,
            "likelihood": self.likelihood,
            "consequence": self.consequence,
            "risk_score": self.risk_score,
            "controls": self.controls,
            "spatial_reference": self.spatial_reference,
            "source_page": self.source_page,
            "source_text": self.source_text[:500],
            "confidence": round(self.confidence, 2),
            "extraction_mode": self.extraction_mode,
        }


# ═════════════════════════════════════════════════════════════════════════════
# Category classification keywords
# ═════════════════════════════════════════════════════════════════════════════

_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "crowd_crush": [
        "crowd", "crush", "stampede", "overcrowd", "capacity", "density",
        "congestion", "bottleneck", "egress", "ingress", "spectator",
        "pedestrian", "surge", "crowd management", "crowd control",
        "crowd flow", "queuing", "queue", "gathering", "assembly",
        "attendance", "occupancy",
    ],
    "fire": [
        "fire", "flame", "pyrotechnic", "firework", "combustible",
        "flammable", "extinguisher", "fire marshal", "fire exit",
        "smoke", "burn", "ignition", "fire service", "fire brigade",
    ],
    "weather": [
        "weather", "wind", "rain", "storm", "lightning", "thunder",
        "flood", "temperature", "heat", "cold", "ice", "snow",
        "adverse weather", "met eireann", "forecast", "gust",
        "heavy rain", "wet", "slippery",
    ],
    "security": [
        "security", "terrorism", "terror", "threat", "hostile",
        "suspicious", "theft", "assault", "violence", "weapon",
        "knife", "bomb", "intoxicat", "anti-social", "antisocial",
        "drugs", "alcohol", "garda", "police", "steward",
        "public order", "disorder",
    ],
    "medical": [
        "medical", "first aid", "ambulance", "paramedic", "injury",
        "casualty", "hospital", "health", "illness", "cardiac",
        "defibrillator", "aed", "triage", "treatment", "welfare",
        "fatality", "death", "trauma", "allergic", "anaphyla",
    ],
    "infrastructure": [
        "infrastructure", "structure", "scaffold", "stage", "barrier",
        "fencing", "hoarding", "temporary structure", "marquee",
        "tent", "rigging", "lighting", "power", "generator",
        "electrical", "cable", "truss", "collapse", "structural",
        "ground condition", "surface", "trip", "slip", "fall",
        "access", "ramp", "disability",
    ],
    "traffic": [
        "traffic", "vehicle", "road closure", "road", "parking",
        "bus", "transport", "pedestrian crossing", "junction",
        "intersection", "diversion", "bollard", "crash barrier",
        "traffic management", "route", "roadway", "hgv", "lorry",
        "delivery", "loading",
    ],
    "environmental": [
        "environment", "noise", "pollution", "waste", "litter",
        "sanitation", "toilet", "water quality", "river", "waterway",
        "canal", "drowning", "water safety", "marine", "coastal",
        "harbour", "dock", "quay", "corrib", "tide",
    ],
}

# ── Control-measure keywords ────────────────────────────────────────────────
_CONTROL_KEYWORDS = [
    "mitigat", "control", "measure", "plan", "procedure", "protocol",
    "barrier", "fencing", "steward", "marshal", "signage", "sign",
    "communication", "radio", "cctv", "camera", "first aid",
    "briefing", "training", "inspection", "check", "monitor",
    "evacuat", "assembly point", "exit", "route", "pa system",
    "public address", "announcement", "water point", "welfare",
    "lighting", "generator", "backup",
]

# ── Spatial reference patterns ──────────────────────────────────────────────
_SPATIAL_PATTERNS = [
    re.compile(r"(?:on|at|along|near|beside|adjacent to|opposite)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\s+(?:Street|Road|Lane|Square|Bridge|Park|Quay|Avenue|Place|Row|Way|Drive|Terrace|Close|Court|Crescent|Gate|Hill|Walk))", re.I),
    re.compile(r"\b(Shop\s*Street|Eyre\s*Square|Spanish\s*Arch|Quay\s*Street|Claddagh|Salthill|Galway\s*Cathedral|NUI\s*Galway|Wolfe\s*Tone\s*Bridge|O'Brien['']?s?\s*Bridge|Salmon\s*Weir\s*Bridge|River\s*Corrib|Fr\.\s*Griffin\s*Road|Dominick\s*Street|William\s*Street|Mainguard\s*Street|High\s*Street|Cross\s*Street|Abbeygate\s*Street|Flood\s*Street|Merchant['']?s?\s*Road|Dock\s*Road|Long\s*Walk|Nimmo['']?s?\s*Pier|South\s*Park)\b", re.I),
    re.compile(r"\b(Zone\s*[A-Z0-9]+|Sector\s*\d+|Area\s*[A-Z0-9]+|Point\s*[A-Z0-9]+)\b", re.I),
    re.compile(r"\b(\d{1,2}[°]\s*\d{1,2}[′']\s*[NS])\b"),  # lat/lon
]


def _make_risk_id(text: str, page: int) -> str:
    """Generate a stable short hash for a risk entry."""
    h = hashlib.md5(f"{text[:100]}:{page}".encode()).hexdigest()[:8]
    return f"RISK-{h.upper()}"


def _classify_category(text: str) -> tuple[str, float]:
    """Classify text into the best-matching hazard category."""
    text_lower = text.lower()
    scores: dict[str, int] = {}
    for cat, keywords in _CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in text_lower)
        if score > 0:
            scores[cat] = score

    if not scores:
        return "infrastructure", 0.2  # default fallback

    best = max(scores, key=scores.get)  # type: ignore[arg-type]
    total_kw = sum(scores.values())
    confidence = min(scores[best] / max(total_kw, 1) + 0.3, 1.0)
    return best, confidence


def _extract_controls(text: str) -> list[str]:
    """Extract control-measure sentences from text."""
    controls: list[str] = []
    sentences = re.split(r"[.;]\s+", text)
    for sent in sentences:
        sent_lower = sent.lower()
        if any(kw in sent_lower for kw in _CONTROL_KEYWORDS):
            cleaned = sent.strip().rstrip(".")
            if 10 < len(cleaned) < 300:
                controls.append(cleaned)
    return controls[:10]  # cap at 10


def _extract_spatial(text: str) -> str | None:
    """Pull the first spatial reference from text."""
    for pat in _SPATIAL_PATTERNS:
        m = pat.search(text)
        if m:
            return m.group(1) if m.lastindex else m.group(0)
    return None


def _normalise_likelihood(raw: str) -> str:
    raw_lower = raw.strip().lower()
    return _LIKELIHOOD_MAP.get(raw_lower, "medium")


def _normalise_consequence(raw: str) -> str:
    raw_lower = raw.strip().lower()
    return _CONSEQUENCE_MAP.get(raw_lower, "moderate")


# ═════════════════════════════════════════════════════════════════════════════
# Rule-based table row extraction
# ═════════════════════════════════════════════════════════════════════════════

# Matches table rows like  "2 5 10"  or  "L:2 C:5 R:10"  or  "2 x 5 = 10"
_SCORE_ROW_PATTERN = re.compile(
    r"""
    (?:^|\n)                             # line start
    (?P<context>.{0,200}?)               # preceding context (hazard text)
    (?:                                  # score block variants:
        (?P<l>\d)\s*[x×X*]\s*(?P<c>\d)\s*[=:]\s*(?P<r>\d{1,2})   # 2 x 5 = 10
      | (?:L\s*[:=]?\s*)?(?P<l2>\d)\s+(?:C\s*[:=]?\s*)?(?P<c2>\d)\s+(?:R\s*[:=]?\s*)?(?P<r2>\d{1,2})   # L:2 C:5 R:10 or just "2 5 10"
    )
    (?P<after>.{0,300})                  # trailing context (controls)
    """,
    re.VERBOSE | re.DOTALL,
)

# Simpler pattern for just three numbers in sequence (on the same line)
_THREE_NUMS_LINE = re.compile(r"^.*?(\d)\s+(\d)\s+(\d{1,2})\s*$", re.MULTILINE)


def _extract_table_risks_from_text(text: str, page_num: int) -> list[ExtractedRisk]:
    """Parse risk-table rows from page text using score patterns."""
    risks: list[ExtractedRisk] = []

    # Patterns that indicate false positives (page numbers, years, etc.)
    _FALSE_POSITIVE_PATTERNS = [
        re.compile(r"page\s+\d+\s*(?:of|/)\s*\d+", re.I),
        re.compile(r"\b20[12]\d\b"),                        # year numbers
        re.compile(r"^\s*(?:page|section|chapter|table|figure|appendix)\s", re.I),
        re.compile(r"(?:CPPP|GIAF|WHALE|SPECTACLE)", re.I), # document title words
    ]

    for m in _SCORE_ROW_PATTERN.finditer(text):
        l_val = m.group("l") or m.group("l2")
        c_val = m.group("c") or m.group("c2")
        r_val = m.group("r") or m.group("r2")
        if not (l_val and c_val and r_val):
            continue

        l_int, c_int, r_int = int(l_val), int(c_val), int(r_val)

        # Strict validity checks for L×C=R risk scores
        if not (1 <= l_int <= 5 and 1 <= c_int <= 5 and 1 <= r_int <= 25):
            continue

        # Sanity: L*C should roughly equal R (allow ±1 for rounding)
        if abs(l_int * c_int - r_int) > 2:
            continue

        context = (m.group("context") or "").strip()
        after = (m.group("after") or "").strip()
        full_text = f"{context} {l_val} {c_val} {r_val} {after}".strip()

        # ── Reject false positives ──────────────────────────────────
        match_region = m.group(0)
        is_false_positive = False
        for fp_pat in _FALSE_POSITIVE_PATTERNS:
            if fp_pat.search(match_region[:80]):
                is_false_positive = True
                break

        if is_false_positive:
            continue

        # Reject if context is too short and lacks risk-relevant keywords
        context_lower = context.lower()
        if len(context) < 15:
            risk_keywords = ["risk", "hazard", "injury", "crowd", "fire", "medical",
                             "weather", "security", "traffic", "structure", "barrier",
                             "evacuati", "emergency", "control", "danger"]
            if not any(kw in context_lower for kw in risk_keywords):
                # Also check the after text
                after_lower = after.lower()
                if not any(kw in after_lower for kw in risk_keywords):
                    continue

        cat, conf = _classify_category(full_text)
        controls = _extract_controls(after)
        spatial = _extract_spatial(full_text)

        # Build a title from the context
        title_text = context or full_text
        title_lines = [ln.strip() for ln in title_text.split("\n") if ln.strip()]
        title = title_lines[-1][:120] if title_lines else f"Risk on page {page_num}"

        risk = ExtractedRisk(
            id=_make_risk_id(full_text, page_num),
            hazard_category=cat,
            title=title,
            description=full_text[:500],
            likelihood=_normalise_likelihood(l_val),
            consequence=_normalise_consequence(c_val),
            risk_score=r_int,
            controls=controls,
            spatial_reference=spatial,
            source_page=page_num,
            source_text=full_text[:500],
            confidence=round(conf + 0.2, 2),   # table rows get a bonus
            extraction_mode="rule_based_table",
        )
        risks.append(risk)

    return risks


def _extract_table_risks_from_structured(
    table_data: list[list[str]], page_num: int
) -> list[ExtractedRisk]:
    """Parse risk entries from pdfplumber structured table data."""
    risks: list[ExtractedRisk] = []
    if not table_data:
        return risks

    # Try to identify header row
    header_idx = -1
    for i, row in enumerate(table_data):
        row_text = " ".join(row).lower()
        if any(kw in row_text for kw in ["hazard", "risk", "likelihood", "consequence", "control"]):
            header_idx = i
            break

    # Determine column mapping from header
    col_map: dict[str, int] = {}
    if header_idx >= 0 and header_idx < len(table_data):
        header = table_data[header_idx]
        for ci, cell in enumerate(header):
            cell_l = cell.lower()
            if "hazard" in cell_l or "risk" in cell_l and "id" not in cell_l:
                col_map.setdefault("hazard", ci)
            if "likelihood" in cell_l or "probab" in cell_l:
                col_map["likelihood"] = ci
            if "consequence" in cell_l or "severity" in cell_l or "impact" in cell_l:
                col_map["consequence"] = ci
            if "control" in cell_l or "mitigat" in cell_l or "measure" in cell_l:
                col_map["controls"] = ci
            if "score" in cell_l or "rating" in cell_l or "risk" in cell_l:
                col_map.setdefault("score", ci)
            if "description" in cell_l or "detail" in cell_l:
                col_map["description"] = ci

    data_rows = table_data[header_idx + 1:] if header_idx >= 0 else table_data

    # If no risk-related header was found, skip this table entirely
    # (it's likely a ToC, schedule, contact list, etc.)
    if header_idx < 0 and not col_map:
        return risks

    # False-positive row patterns
    _FP_ROW = re.compile(
        r"(?:page\s+\d+\s*(?:of|/)\s*\d+|page\s+\d+of|\b20[12]\d\b|"
        r"CPPP|GIAF|WHALE|SPECTACLE|table\s+of\s+contents|"
        r"^\s*\d+\s*$)",  # rows that are just a number
        re.I,
    )

    for row in data_rows:
        if len(row) < 3:
            continue
        row_text = " ".join(row)
        if len(row_text.strip()) < 10:
            continue

        # Skip false-positive rows (headers, footers, title rows)
        if _FP_ROW.search(row_text):
            continue

        # Extract fields using column map or fallback
        hazard_text = row[col_map["hazard"]] if "hazard" in col_map and col_map["hazard"] < len(row) else row_text
        desc = row[col_map["description"]] if "description" in col_map and col_map["description"] < len(row) else hazard_text

        # Try to find L/C/R values
        l_val, c_val, r_val = "3", "3", None

        if "likelihood" in col_map and col_map["likelihood"] < len(row):
            l_raw = row[col_map["likelihood"]].strip()
            if l_raw and l_raw[0].isdigit():
                l_val = l_raw[0]

        if "consequence" in col_map and col_map["consequence"] < len(row):
            c_raw = row[col_map["consequence"]].strip()
            if c_raw and c_raw[0].isdigit():
                c_val = c_raw[0]

        if "score" in col_map and col_map["score"] < len(row):
            s_raw = row[col_map["score"]].strip()
            nums = re.findall(r"\d+", s_raw)
            if nums:
                score_val = int(nums[0])
                # Reject scores outside valid L×C range [1, 25]
                if 1 <= score_val <= 25:
                    r_val = score_val

        # Also scan all cells for a "L C R" pattern
        if r_val is None:
            for cell in row:
                nums = re.findall(r"\b(\d)\b", cell)
                if len(nums) >= 3:
                    li, ci, ri = int(nums[0]), int(nums[1]), int(nums[2])
                    if abs(li * ci - ri) <= 2 and 1 <= li <= 5 and 1 <= ci <= 5:
                        l_val, c_val, r_val = str(li), str(ci), ri
                        break

        cat, conf = _classify_category(row_text)
        controls = _extract_controls(row_text)
        if "controls" in col_map and col_map["controls"] < len(row):
            ctrl_text = row[col_map["controls"]]
            if ctrl_text:
                controls = _extract_controls(ctrl_text) or [ctrl_text.strip()[:200]]

        spatial = _extract_spatial(row_text)
        title_text = hazard_text.split("\n")[0].strip()[:120] or f"Risk on page {page_num}"

        # Final validity: computed risk score must be in valid range
        computed_score = r_val if r_val else int(l_val) * int(c_val)
        if computed_score > 25:
            continue

        risk = ExtractedRisk(
            id=_make_risk_id(row_text, page_num),
            hazard_category=cat,
            title=title_text,
            description=desc[:500],
            likelihood=_normalise_likelihood(l_val),
            consequence=_normalise_consequence(c_val),
            risk_score=computed_score,
            controls=controls,
            spatial_reference=spatial,
            source_page=page_num,
            source_text=row_text[:500],
            confidence=round(conf + 0.15, 2),
            extraction_mode="rule_based_table",
        )
        risks.append(risk)

    return risks


# ═════════════════════════════════════════════════════════════════════════════
# Rule-based keyword / sentence extraction
# ═════════════════════════════════════════════════════════════════════════════

# Patterns that strongly signal a risk description
_RISK_SENTENCE_PATTERNS = [
    re.compile(r"(?:risk|hazard|danger)\s+(?:of|that|from|due to|associated with)", re.I),
    re.compile(r"(?:may|could|might)\s+(?:result in|cause|lead to)", re.I),
    re.compile(r"(?:potential|possible)\s+(?:risk|hazard|injury|harm|damage)", re.I),
    re.compile(r"(?:in the event of|in case of|should .+ occur)", re.I),
    re.compile(r"(?:crush|stampede|overcrowd|suffocation|asphyxiation)", re.I),
    re.compile(r"(?:evacuat|emergency\s+(?:plan|procedure|exit|response))", re.I),
]


def _extract_keyword_risks(text: str, page_num: int) -> list[ExtractedRisk]:
    """Extract risks from free-text paragraphs using keyword/pattern matching."""
    risks: list[ExtractedRisk] = []
    # Split into paragraphs
    paragraphs = re.split(r"\n\s*\n", text)

    for para in paragraphs:
        para = para.strip()
        if len(para) < 30:
            continue

        # Check if paragraph contains risk-signalling patterns
        matched_patterns = sum(1 for pat in _RISK_SENTENCE_PATTERNS if pat.search(para))
        if matched_patterns == 0:
            # Also check for high concentration of category keywords
            para_lower = para.lower()
            total_hits = sum(
                1 for kws in _CATEGORY_KEYWORDS.values()
                for kw in kws if kw in para_lower
            )
            if total_hits < 3:
                continue

        cat, conf = _classify_category(para)
        controls = _extract_controls(para)
        spatial = _extract_spatial(para)

        # Build title from first meaningful sentence
        sentences = re.split(r"[.!?]\s+", para)
        title = sentences[0].strip()[:120] if sentences else para[:80]

        # Estimate likelihood/consequence from context clues
        para_lower = para.lower()
        likelihood = "medium"
        if any(w in para_lower for w in ["very likely", "almost certain", "frequent", "regular"]):
            likelihood = "very_high"
        elif any(w in para_lower for w in ["likely", "probable", "expected"]):
            likelihood = "high"
        elif any(w in para_lower for w in ["unlikely", "rare", "improbable"]):
            likelihood = "low"

        consequence = "moderate"
        if any(w in para_lower for w in ["fatal", "death", "catastrophic", "critical"]):
            consequence = "catastrophic"
        elif any(w in para_lower for w in ["serious", "major", "significant", "severe"]):
            consequence = "major"
        elif any(w in para_lower for w in ["minor", "slight", "negligible", "trivial"]):
            consequence = "minor"

        risk = ExtractedRisk(
            id=_make_risk_id(para, page_num),
            hazard_category=cat,
            title=title,
            description=para[:500],
            likelihood=likelihood,
            consequence=consequence,
            risk_score=None,
            controls=controls,
            spatial_reference=spatial,
            source_page=page_num,
            source_text=para[:500],
            confidence=round(min(conf, 0.85), 2),
            extraction_mode="rule_based_keyword",
        )
        risks.append(risk)

    return risks


# ═════════════════════════════════════════════════════════════════════════════
# LLM-based extraction (Mode B — optional)
# ═════════════════════════════════════════════════════════════════════════════

def _extract_with_gemini(pages: list[PageContent]) -> list[ExtractedRisk]:
    """Use Google Gemini for structured risk extraction.

    Only called when GOOGLE_API_KEY is available.
    """
    try:
        import google.generativeai as genai
    except ImportError:
        logger.warning("google-generativeai not installed — falling back to rule-based")
        return []

    api_key = os.environ.get("GOOGLE_API_KEY", "")
    if not api_key:
        return []

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-1.5-flash")

    all_risks: list[ExtractedRisk] = []
    # Process in chunks of 5 pages to stay within context limits
    chunk_size = 5

    for i in range(0, len(pages), chunk_size):
        chunk = pages[i:i + chunk_size]
        page_texts = "\n\n".join(
            f"--- PAGE {p.page_number} ---\n{p.cleaned_text}" for p in chunk
        )

        prompt = f"""Analyze this event safety document text and extract ALL risks, hazards, and safety concerns.

For each risk, provide a JSON object with these fields:
- hazard_category: one of {HAZARD_CATEGORIES}
- title: short title (max 120 chars)
- description: detailed description
- likelihood: one of [low, medium, high, very_high]
- consequence: one of [minor, moderate, major, catastrophic]
- risk_score: numeric score if found in text (L×C), otherwise null
- controls: list of control measures mentioned
- spatial_reference: location/area if mentioned
- source_page: page number where found

Return a JSON array of risk objects. Only return the JSON array, no other text.

Document text:
{page_texts[:8000]}
"""
        try:
            response = model.generate_content(prompt)
            import json
            # Try to parse the response as JSON
            text = response.text.strip()
            # Remove markdown code fences if present
            if text.startswith("```"):
                text = re.sub(r"^```(?:json)?\n?", "", text)
                text = re.sub(r"\n?```$", "", text)

            risk_dicts = json.loads(text)
            if isinstance(risk_dicts, list):
                for rd in risk_dicts:
                    risk = ExtractedRisk(
                        id=_make_risk_id(rd.get("title", ""), rd.get("source_page", i)),
                        hazard_category=rd.get("hazard_category", "infrastructure"),
                        title=rd.get("title", "Untitled risk"),
                        description=rd.get("description", ""),
                        likelihood=rd.get("likelihood", "medium"),
                        consequence=rd.get("consequence", "moderate"),
                        risk_score=rd.get("risk_score"),
                        controls=rd.get("controls", []),
                        spatial_reference=rd.get("spatial_reference"),
                        source_page=rd.get("source_page", i + 1),
                        source_text=rd.get("description", "")[:500],
                        confidence=0.90,
                        extraction_mode="llm_gemini",
                    )
                    all_risks.append(risk)
        except Exception as exc:
            logger.warning("Gemini extraction failed for chunk %d: %s", i, exc)
            continue

    logger.info("🤖 Gemini extracted %d risks", len(all_risks))
    return all_risks


# ═════════════════════════════════════════════════════════════════════════════
# Main extraction pipeline
# ═════════════════════════════════════════════════════════════════════════════

def _deduplicate_risks(risks: list[ExtractedRisk]) -> list[ExtractedRisk]:
    """Remove near-duplicate risks based on similar titles + same page."""
    seen: dict[str, ExtractedRisk] = {}
    for risk in risks:
        # Create a dedup key from category + normalised title fragment + page
        title_norm = re.sub(r"[^a-z0-9 ]", "", risk.title.lower()).strip()
        key_fragment = title_norm[:40]
        dedup_key = f"{risk.hazard_category}:{key_fragment}:{risk.source_page}"

        if dedup_key in seen:
            # Keep the one with higher confidence
            if risk.confidence > seen[dedup_key].confidence:
                seen[dedup_key] = risk
        else:
            seen[dedup_key] = risk

    return list(seen.values())


def extract_risks(
    pages: list[PageContent] | None = None,
    force_mode: str | None = None,
) -> list[ExtractedRisk]:
    """Extract risks from PDF pages.

    Parameters
    ----------
    pages : list[PageContent], optional
        Pre-extracted pages.  If None, extracts from default Galway PDF.
    force_mode : str, optional
        Force "rule_based" or "llm" mode.  Auto-detects by default.

    Returns
    -------
    list[ExtractedRisk]
    """
    if pages is None:
        pages = extract_pages()

    use_llm = (
        force_mode == "llm"
        or (force_mode is None and os.environ.get("GOOGLE_API_KEY"))
    )

    all_risks: list[ExtractedRisk] = []

    if use_llm:
        logger.info("🤖 Using Gemini LLM for risk extraction")
        llm_risks = _extract_with_gemini(pages)
        if llm_risks:
            all_risks.extend(llm_risks)
            # Still run rule-based for table rows (more precise for scored risks)
            logger.info("📊 Also running rule-based extraction for scored table rows")

    # ── Rule-based extraction ───────────────────────────────────────────
    logger.info("📋 Running rule-based risk extraction on %d pages", len(pages))

    for page in pages:
        # 1) Structured table data from pdfplumber
        if page.table_data:
            table_risks = _extract_table_risks_from_structured(
                page.table_data, page.page_number
            )
            all_risks.extend(table_risks)

        # 2) Score patterns in raw text (catches tables missed by pdfplumber)
        text_table_risks = _extract_table_risks_from_text(
            page.cleaned_text, page.page_number
        )
        all_risks.extend(text_table_risks)

        # 3) Keyword/sentence-based extraction from free text
        keyword_risks = _extract_keyword_risks(
            page.cleaned_text, page.page_number
        )
        all_risks.extend(keyword_risks)

    # ── Deduplicate ─────────────────────────────────────────────────────
    all_risks = _deduplicate_risks(all_risks)

    # ── Sort by page number, then risk score descending ─────────────────
    all_risks.sort(
        key=lambda r: (r.source_page, -(r.risk_score or 0)),
    )

    # Assign sequential IDs for cleaner output
    for i, risk in enumerate(all_risks, 1):
        risk.id = f"RISK-{i:03d}"

    logger.info("✅ Extracted %d risks (%d from tables, %d from keywords)",
                len(all_risks),
                sum(1 for r in all_risks if "table" in r.extraction_mode),
                sum(1 for r in all_risks if "keyword" in r.extraction_mode))

    return all_risks


def risks_to_dicts(risks: list[ExtractedRisk]) -> list[dict]:
    """Serialise risk list to JSON-safe dicts."""
    return [r.to_dict() for r in risks]


# ── Standalone runner ────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    )
    risks = extract_risks()
    print(f"\n{'='*70}")
    print(f"Extracted {len(risks)} risks")
    print(f"  Table-based : {sum(1 for r in risks if 'table' in r.extraction_mode)}")
    print(f"  Keyword-based: {sum(1 for r in risks if 'keyword' in r.extraction_mode)}")
    print(f"{'='*70}")

    # Category breakdown
    from collections import Counter
    cats = Counter(r.hazard_category for r in risks)
    print("\nCategory breakdown:")
    for cat, count in cats.most_common():
        print(f"  {cat:20s} : {count}")

    print(f"\n{'='*70}")
    print("Top 10 highest-risk items:")
    scored = sorted(risks, key=lambda r: -(r.risk_score or 0))
    for r in scored[:10]:
        print(f"  [{r.id}] score={r.risk_score or '?':>3}  "
              f"L={r.likelihood:<10s} C={r.consequence:<14s}  "
              f"cat={r.hazard_category:<16s} p.{r.source_page}  "
              f"{r.title[:60]}")
