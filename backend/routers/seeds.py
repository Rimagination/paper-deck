from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Query, Request

from backend.models.schemas import PaperSummary, SeedSearchRequest
from backend.services.paper_metadata import build_paper_summary
from backend.services.semantic_scholar import (
    SemanticScholarError,
    SemanticScholarNotFoundError,
    resolve_lookup_input,
)

router = APIRouter(prefix="/seeds", tags=["seeds"])


async def _resolve_search_candidates(request: Request, raw_papers: list[dict]) -> list[dict]:
    s2 = request.app.state.s2_client

    async def resolve_candidate(paper: dict) -> str | None:
        paper_id = str(paper.get("paperId") or "").strip()
        if not paper_id:
            return None
        if ":" not in paper_id or paper_id.upper().startswith("DOI:"):
            return paper_id
        try:
            resolved = await s2.get_paper(paper_id, fields="paperId")
        except (SemanticScholarError, SemanticScholarNotFoundError):
            return None
        canonical_id = str(resolved.get("paperId") or "").strip()
        return canonical_id or None

    resolved_ids = await asyncio.gather(*(resolve_candidate(paper) for paper in raw_papers))
    seen: set[str] = set()
    results: list[dict] = []
    for paper, canonical_id in zip(raw_papers, resolved_ids):
        if not canonical_id or canonical_id in seen:
            continue
        seen.add(canonical_id)
        results.append({**paper, "paperId": canonical_id})
    return results


@router.post("/search")
async def search_seeds(request: Request, body: SeedSearchRequest) -> list[PaperSummary]:
    query = body.query.strip()
    if len(query) < 2:
        return []

    cache = request.app.state.cache
    cache_key = f"pd:search:v4:{query.lower()}"
    cached = await cache.get_json(cache_key)
    if cached is not None:
        return [PaperSummary(**p) for p in cached]

    oa = request.app.state.oa_client
    journal_zone = request.app.state.journal_zone
    raw_papers = await oa.search_papers(query, limit=6)
    resolved_papers = (await _resolve_search_candidates(request, raw_papers))[:3]
    results = [build_paper_summary(paper, journal_zone=journal_zone) for paper in resolved_papers]

    await cache.set_json(cache_key, [p.model_dump() for p in results], request.app.state.settings.cache_ttl_search)
    return results


@router.get("/resolve")
async def resolve_seed(
    request: Request,
    paper_id: str | None = Query(None),
    doi: str | None = Query(None),
    input: str | None = Query(None),
) -> PaperSummary:
    s2 = request.app.state.s2_client
    oa = request.app.state.oa_client
    journal_zone = request.app.state.journal_zone

    lookup_id = paper_id
    if doi:
        lookup_id = f"DOI:{doi}"
    if input:
        lookup_id = resolve_lookup_input(input)
    if not lookup_id:
        raise HTTPException(
            status_code=400,
            detail="Provide paper_id, doi, or input with DOI / URL / Semantic Scholar paper id.",
        )

    try:
        paper = await s2.get_paper(lookup_id)
        return build_paper_summary(paper, journal_zone=journal_zone)
    except SemanticScholarNotFoundError as exc:
        fallback_paper = await oa.get_paper_by_lookup(lookup_id)
        if fallback_paper:
            return build_paper_summary(fallback_paper, journal_zone=journal_zone)
        raise HTTPException(status_code=404, detail="Paper not found.") from exc
    except SemanticScholarError as exc:
        fallback_paper = await oa.get_paper_by_lookup(lookup_id)
        if fallback_paper:
            return build_paper_summary(fallback_paper, journal_zone=journal_zone)
        raise HTTPException(status_code=exc.status_code or 502, detail=str(exc)) from exc
