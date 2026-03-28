from __future__ import annotations

from typing import Any

from backend.models.schemas import PaperSummary
from backend.services.journal_zone import JournalZoneService
from backend.services.semantic_scholar import normalize_authors, resolve_doi, resolve_url


def extract_issn_fields(paper: dict[str, Any]) -> tuple[str | None, str | None]:
    issn = paper.get("issn")
    eissn = paper.get("eissn")

    source = ((paper.get("primary_location") or {}).get("source") or {})
    source_issns = [value for value in (source.get("issn") or []) if value]
    issn_l = source.get("issn_l")

    if not issn:
        issn = issn_l or (source_issns[0] if source_issns else None)

    if not eissn:
        for candidate in source_issns:
            if candidate != issn:
                eissn = candidate
                break

    return issn, eissn


def lookup_zone_for_paper(
    paper: dict[str, Any],
    journal_zone: JournalZoneService | None,
) -> str | None:
    if journal_zone is None:
        return None

    issn, eissn = extract_issn_fields(paper)
    source = ((paper.get("primary_location") or {}).get("source") or {})
    venue_title = paper.get("venue") or source.get("display_name")
    return journal_zone.lookup(issn=issn, eissn=eissn, title=venue_title)


def enrich_paper_metadata(
    paper: dict[str, Any],
    journal_zone: JournalZoneService | None,
) -> dict[str, str | None]:
    issn, eissn = extract_issn_fields(paper)
    zone = lookup_zone_for_paper(paper, journal_zone)
    return {
        "issn": issn,
        "eissn": eissn,
        "zone": zone,
    }


def build_paper_summary(
    paper: dict[str, Any],
    *,
    journal_zone: JournalZoneService | None = None,
    similarity: float = 0.0,
) -> PaperSummary:
    metadata = enrich_paper_metadata(paper, journal_zone)
    return PaperSummary(
        paper_id=paper.get("paperId", ""),
        title=paper.get("title") or "Untitled",
        authors=normalize_authors(paper),
        year=paper.get("year"),
        citation_count=paper.get("citationCount") or 0,
        abstract=paper.get("abstract"),
        venue=paper.get("venue"),
        doi=resolve_doi(paper),
        url=resolve_url(paper),
        similarity_score=similarity,
        issn=metadata["issn"],
        eissn=metadata["eissn"],
        zone=metadata["zone"],
    )
