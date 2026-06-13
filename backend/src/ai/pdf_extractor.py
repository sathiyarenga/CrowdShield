"""PDF text extraction using pdfplumber.

Extracts text page-by-page from event safety documents, detects section
headings, and returns structured page content with section labels.

Run standalone:
    python -m src.ai.pdf_extractor
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path

import pdfplumber

logger = logging.getLogger(__name__)

# ── Default PDF path ────────────────────────────────────────────────────────
GALWAY_PDF = Path(__file__).resolve().parents[3] / (
    "Data/Galway/GIAF THE WHALE STREET SPECTACLE 2026 copy.pdf"
)

# ── Heading detection patterns ──────────────────────────────────────────────
# Lines that are ALL-CAPS, short, and look like section headings
_HEADING_PATTERNS = [
    re.compile(r"^\d+[\.\)]\s+[A-Z].*$"),                     # "1. INTRODUCTION"
    re.compile(r"^\d+\.\d+[\.\)]*\s+[A-Z].*$"),               # "3.2 CROWD MANAGEMENT"
    re.compile(r"^[A-Z][A-Z\s&/\-]{4,60}$"),                  # "RISK ASSESSMENT"
    re.compile(r"^(?:SECTION|PART|CHAPTER|APPENDIX)\s+\d+", re.I),
    re.compile(r"^(?:TABLE OF CONTENTS|CONTENTS|INDEX)$", re.I),
]

# Patterns that indicate a risk-assessment table header row
_TABLE_HEADER_PATTERNS = [
    re.compile(r"hazard|risk\s*(?:id|no|ref)", re.I),
    re.compile(r"likelihood.*consequence|severity.*probability", re.I),
    re.compile(r"\bL\b.*\bC\b.*\bR\b", re.I),                 # L × C = R columns
]


@dataclass
class PageContent:
    """Structured content from a single PDF page."""
    page_number: int          # 1-indexed
    raw_text: str
    cleaned_text: str
    sections: list[str] = field(default_factory=list)
    detected_headings: list[str] = field(default_factory=list)
    has_table: bool = False
    table_data: list[list[str]] = field(default_factory=list)
    char_count: int = 0
    word_count: int = 0


def _clean_text(text: str) -> str:
    """Normalise whitespace and remove artefacts from PDF extraction."""
    if not text:
        return ""
    # collapse multiple spaces / tabs
    text = re.sub(r"[ \t]+", " ", text)
    # collapse 3+ newlines into 2
    text = re.sub(r"\n{3,}", "\n\n", text)
    # strip trailing whitespace per line
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    return text.strip()


def _detect_headings(text: str) -> list[str]:
    """Return lines that look like section headings."""
    headings: list[str] = []
    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped or len(stripped) < 3:
            continue
        for pat in _HEADING_PATTERNS:
            if pat.match(stripped):
                headings.append(stripped)
                break
    return headings


def _infer_section(headings: list[str], prev_section: str) -> str:
    """Pick the best section label from detected headings, or carry forward."""
    if headings:
        return headings[0]
    return prev_section


def _has_risk_table_header(text: str) -> bool:
    """Check whether the page text contains a risk-table header row."""
    for pat in _TABLE_HEADER_PATTERNS:
        if pat.search(text):
            return True
    return False


def extract_pages(pdf_path: Path | str | None = None) -> list[PageContent]:
    """Extract structured text from every page of the PDF.

    Parameters
    ----------
    pdf_path : Path or str, optional
        Path to the PDF.  Defaults to the Galway event plan.

    Returns
    -------
    list[PageContent]
        One entry per page, with cleaned text, headings, and table data.
    """
    pdf_path = Path(pdf_path) if pdf_path else GALWAY_PDF
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    logger.info("📄 Opening PDF: %s", pdf_path.name)
    pages: list[PageContent] = []
    current_section = "DOCUMENT START"

    with pdfplumber.open(pdf_path) as pdf:
        total = len(pdf.pages)
        logger.info("   Total pages: %d", total)

        for idx, page in enumerate(pdf.pages):
            page_num = idx + 1
            raw = page.extract_text() or ""
            cleaned = _clean_text(raw)
            headings = _detect_headings(cleaned)
            current_section = _infer_section(headings, current_section)

            # ── Table extraction ────────────────────────────────────────
            table_data: list[list[str]] = []
            has_table = False
            try:
                tables = page.extract_tables()
                if tables:
                    has_table = True
                    for tbl in tables:
                        for row in tbl:
                            cleaned_row = [
                                (cell or "").strip() for cell in row
                            ]
                            if any(cleaned_row):
                                table_data.append(cleaned_row)
            except Exception as exc:
                logger.debug("Table extraction failed on p%d: %s", page_num, exc)

            # Also flag pages whose text looks like a risk table
            if not has_table and _has_risk_table_header(cleaned):
                has_table = True

            pc = PageContent(
                page_number=page_num,
                raw_text=raw,
                cleaned_text=cleaned,
                sections=[current_section],
                detected_headings=headings,
                has_table=has_table,
                table_data=table_data,
                char_count=len(cleaned),
                word_count=len(cleaned.split()),
            )
            pages.append(pc)

            if page_num % 20 == 0 or page_num == total:
                logger.info("   Extracted %d / %d pages", page_num, total)

    logger.info("✅ PDF extraction complete: %d pages, %d with tables",
                len(pages), sum(1 for p in pages if p.has_table))
    return pages


def pages_to_dict(pages: list[PageContent]) -> list[dict]:
    """Serialise PageContent list to JSON-safe dicts."""
    return [
        {
            "page_number": p.page_number,
            "cleaned_text": p.cleaned_text,
            "sections": p.sections,
            "detected_headings": p.detected_headings,
            "has_table": p.has_table,
            "table_data": p.table_data,
            "char_count": p.char_count,
            "word_count": p.word_count,
        }
        for p in pages
    ]


# ── Standalone runner ────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    )
    pages = extract_pages()
    print(f"\n{'='*60}")
    print(f"Extracted {len(pages)} pages from {GALWAY_PDF.name}")
    print(f"Pages with tables: {sum(1 for p in pages if p.has_table)}")
    print(f"Total words: {sum(p.word_count for p in pages):,}")
    print(f"{'='*60}\n")

    # Show first 3 pages summary
    for p in pages[:5]:
        print(f"  Page {p.page_number:3d} | {p.word_count:5d} words | "
              f"sections={p.sections} | headings={p.detected_headings[:2]}")
    print("  ...")
    for p in pages[-3:]:
        print(f"  Page {p.page_number:3d} | {p.word_count:5d} words | "
              f"sections={p.sections} | headings={p.detected_headings[:2]}")
