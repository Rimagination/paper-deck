from __future__ import annotations

import re
from typing import Any

from backend.models.schemas import PaperSummary
from backend.services.journal_zone import JournalZoneService
from backend.services.semantic_scholar import normalize_authors, resolve_doi, resolve_url

MIN_DIGEST_ABSTRACT_CHARS = 80
CJK_RE = re.compile(r"[\u4e00-\u9fff]")


def _clean_text(value: Any) -> str:
    return " ".join(str(value or "").replace("\n", " ").replace("\r", " ").split()).strip()


def paper_has_digest_quality(paper: dict[str, Any]) -> bool:
    title = _clean_text(paper.get("title"))
    abstract = _clean_text(paper.get("abstract"))
    return bool(title) and len(abstract) >= MIN_DIGEST_ABSTRACT_CHARS


def _contains_cjk(value: Any) -> bool:
    return bool(CJK_RE.search(_clean_text(value)))


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
) -> dict[str, str | float | bool | None]:
    issn, eissn = extract_issn_fields(paper)
    source = ((paper.get("primary_location") or {}).get("source") or {})
    venue_title = paper.get("venue") or source.get("display_name")
    rank = (
        journal_zone.lookup_metadata(issn=issn, eissn=eissn, title=venue_title)
        if journal_zone is not None
        else None
    )
    return {
        "issn": issn,
        "eissn": eissn,
        "zone": rank.zone if rank else None,
        "impact_factor": rank.impact_factor if rank else None,
        "is_ni": rank.is_ni if rank else False,
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
        impact_factor=metadata["impact_factor"],
        is_ni=bool(metadata["is_ni"]),
    )


async def build_digest_summary(
    paper: dict[str, Any],
    *,
    card_generator: Any,
    journal_zone: JournalZoneService | None = None,
    similarity: float = 0.0,
    language: str = "zh",
) -> PaperSummary | None:
    if not paper_has_digest_quality(paper):
        return None

    title = paper.get("title") or "Untitled"
    title_zh = await card_generator.localize_title(title, "zh")
    card_content = await card_generator.generate_card(paper, mode="discovery", language=language)
    plain_summary = _clean_text((card_content or {}).get("plain_summary"))
    if len(plain_summary) < 24:
        return None
    if language.startswith("zh") and not _contains_cjk(plain_summary):
        return None
    if language.startswith("zh") and not _contains_cjk(title_zh):
        title_zh = ""

    metadata = enrich_paper_metadata(paper, journal_zone)
    return PaperSummary(
        paper_id=paper.get("paperId", ""),
        title=title,
        title_zh=title_zh,
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
        impact_factor=metadata["impact_factor"],
        is_ni=bool(metadata["is_ni"]),
        language=language,
        card_content=card_content,
    )
