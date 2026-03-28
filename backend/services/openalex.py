from __future__ import annotations

from typing import Any

import httpx

OPENALEX_BASE = "https://api.openalex.org"
OPENALEX_SELECT = (
    "id,doi,display_name,publication_year,cited_by_count,"
    "primary_location,authorships,abstract_inverted_index"
)


def _reconstruct_abstract(inverted_index: dict | None) -> str | None:
    if not inverted_index:
        return None
    try:
        pairs: list[tuple[int, str]] = []
        for word, positions in inverted_index.items():
            for pos in positions:
                pairs.append((pos, word))
        pairs.sort()
        return " ".join(word for _, word in pairs)
    except (ValueError, TypeError):
        return None


def _extract_doi(work: dict) -> str | None:
    raw = work.get("doi") or ""
    for prefix in ("https://doi.org/", "http://doi.org/"):
        if raw.startswith(prefix):
            return raw[len(prefix):]
    return raw or None


def _extract_paper_id(work: dict) -> str:
    doi = _extract_doi(work)
    if doi:
        return f"DOI:{doi}"
    oa_id = work.get("id") or ""
    short = oa_id.rsplit("/", 1)[-1] if "/" in oa_id else oa_id
    return f"OA:{short}" if short else ""


def _extract_venue(work: dict) -> str | None:
    loc = work.get("primary_location") or {}
    source = loc.get("source") or {}
    return source.get("display_name") or None


def _extract_issn_fields(work: dict) -> tuple[str | None, str | None]:
    loc = work.get("primary_location") or {}
    source = loc.get("source") or {}
    issn_l = source.get("issn_l")
    issns = [value for value in (source.get("issn") or []) if value]

    issn = issn_l or (issns[0] if issns else None)
    eissn = next((value for value in issns if value != issn), None)
    return issn, eissn


def _extract_authors(work: dict) -> list[dict[str, str]]:
    authorships = work.get("authorships") or []
    result = []
    for authorship in authorships:
        author = authorship.get("author") or {}
        name = (author.get("display_name") or "").strip()
        if name:
            result.append({"name": name})
    return result


def openalex_to_s2_dict(work: dict) -> dict[str, Any]:
    """Convert an OpenAlex work object to a dict compatible with S2 field names."""
    doi = _extract_doi(work)
    issn, eissn = _extract_issn_fields(work)
    return {
        "paperId": _extract_paper_id(work),
        "title": work.get("display_name") or "Untitled",
        "authors": _extract_authors(work),
        "year": work.get("publication_year"),
        "citationCount": work.get("cited_by_count") or 0,
        "abstract": _reconstruct_abstract(work.get("abstract_inverted_index")),
        "venue": _extract_venue(work),
        "externalIds": {"DOI": doi} if doi else {},
        "url": work.get("doi") or None,
        "issn": issn,
        "eissn": eissn,
    }


class OpenAlexClient:
    def __init__(self, user_agent: str = "PaperDeck/1.0") -> None:
        self.client = httpx.AsyncClient(
            base_url=OPENALEX_BASE,
            headers={
                "User-Agent": user_agent,
                "Accept": "application/json",
            },
            timeout=15.0,
        )

    async def close(self) -> None:
        await self.client.aclose()

    async def get_paper_by_lookup(self, paper_id: str) -> dict[str, Any] | None:
        identifier = (paper_id or "").strip()
        if not identifier:
            return None

        if identifier.startswith("DOI:"):
            identifier = f"https://doi.org/{identifier[4:]}"
        elif identifier.startswith("OA:"):
            identifier = identifier[3:]

        try:
            response = await self.client.get(
                f"/works/{identifier}",
                params={"select": OPENALEX_SELECT},
            )
        except httpx.RequestError:
            return None

        if response.is_error:
            return None

        return openalex_to_s2_dict(response.json())

    async def search_venues(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        """Search for journals / conference series by name."""
        try:
            response = await self.client.get(
                "/sources",
                params={
                    "search": query,
                    "per-page": min(limit, 20),
                    "select": "id,display_name,type,works_count,homepage_url,issn_l",
                },
            )
        except httpx.RequestError:
            return []
        if response.is_error:
            return []
        data = response.json()
        results = data.get("results") or []
        venues = []
        for src in results:
            oa_id = src.get("id") or ""
            short_id = oa_id.rsplit("/", 1)[-1] if "/" in oa_id else oa_id
            venues.append({
                "id": short_id,
                "full_id": oa_id,
                "name": src.get("display_name") or "",
                "type": src.get("type") or "",
                "works_count": src.get("works_count") or 0,
                "issn": src.get("issn_l"),
                "url": src.get("homepage_url"),
            })
        return venues

    async def get_recent_papers_by_venue(
        self, source_id: str, days_back: int = 30, limit: int = 25
    ) -> list[dict[str, Any]]:
        """Fetch recently published papers from a venue (OpenAlex source ID)."""
        from datetime import datetime, timedelta, timezone

        since_date = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%d")
        # source_id may be a short id like "S123456" or full URL
        if not source_id.startswith("https://"):
            source_id = f"https://openalex.org/{source_id}"
        try:
            response = await self.client.get(
                "/works",
                params={
                    "filter": f"primary_location.source.id:{source_id},from_publication_date:{since_date}",
                    "sort": "publication_date:desc",
                    "per-page": min(limit, 25),
                    "select": OPENALEX_SELECT,
                },
            )
        except httpx.RequestError:
            return []
        if response.is_error:
            return []
        data = response.json()
        results = data.get("results") or []
        papers = [openalex_to_s2_dict(work) for work in results]
        return [p for p in papers if p.get("paperId")]

    async def search_papers(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        try:
            response = await self.client.get(
                "/works",
                params={
                    "search": query,
                    "per-page": min(limit, 25),
                    "select": OPENALEX_SELECT,
                    "filter": "is_paratext:false",
                },
            )
        except httpx.RequestError:
            return []

        if response.is_error:
            return []

        data = response.json()
        results = data.get("results") or []
        papers = [openalex_to_s2_dict(work) for work in results]
        return [p for p in papers if p.get("paperId")]
