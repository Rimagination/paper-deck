from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request

from backend.models.schemas import PaperSummary, ProfileGenerateRequest, ProfileResponse
from backend.services.interest import average_embeddings
from backend.services.paper_metadata import (
    build_paper_summary,
    hydrate_paper_for_journal_metadata,
    merge_paper_records,
)
from backend.services.semantic_scholar import SemanticScholarError, SemanticScholarNotFoundError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/profile", tags=["profile"])


def _paper_summary_to_dict(paper: PaperSummary) -> dict:
    external_ids = {"DOI": paper.doi} if paper.doi else {}
    return {
        "paperId": paper.paper_id,
        "title": paper.title or "Untitled",
        "authors": [{"name": name} for name in paper.authors if name],
        "year": paper.year,
        "citationCount": paper.citation_count or 0,
        "abstract": paper.abstract,
        "venue": paper.venue,
        "externalIds": external_ids,
        "url": paper.url,
        "issn": paper.issn,
        "eissn": paper.eissn,
    }


async def _resolve_seed_papers(
    request: Request,
    paper_ids: list[str],
    fallback_seed_papers: list[PaperSummary],
) -> list[dict]:
    s2 = request.app.state.s2_client
    oa = request.app.state.oa_client

    ordered_ids: list[str] = []
    seen_requested: set[str] = set()
    for paper_id in paper_ids:
        normalized = str(paper_id or "").strip()
        if not normalized or normalized in seen_requested:
            continue
        seen_requested.add(normalized)
        ordered_ids.append(normalized)

    papers_by_requested: dict[str, dict] = {}
    canonical_ids = [paper_id for paper_id in ordered_ids if ":" not in paper_id]
    if canonical_ids:
        try:
            fetched = await s2.get_papers_batch(canonical_ids)
        except SemanticScholarError:
            fetched = []
        for paper in fetched:
            normalized = str(paper.get("paperId") or "").strip()
            if normalized:
                papers_by_requested[normalized] = paper

    async def resolve_external_seed(paper_id: str) -> dict | None:
        try:
            return await s2.get_paper(paper_id)
        except (SemanticScholarError, SemanticScholarNotFoundError):
            return await oa.get_paper_by_lookup(paper_id)

    external_ids = [paper_id for paper_id in ordered_ids if ":" in paper_id]
    if external_ids:
        resolved = await asyncio.gather(*(resolve_external_seed(paper_id) for paper_id in external_ids))
        for requested_id, paper in zip(external_ids, resolved):
            if not paper:
                continue
            normalized = str(paper.get("paperId") or requested_id).strip() or requested_id
            papers_by_requested[requested_id] = {**paper, "paperId": normalized}

    fallback_by_requested = {
        str(paper.paper_id or "").strip(): _paper_summary_to_dict(paper)
        for paper in fallback_seed_papers
        if str(paper.paper_id or "").strip()
    }

    resolved_papers: list[dict] = []
    seen_resolved: set[str] = set()
    for paper_id in ordered_ids:
        paper = papers_by_requested.get(paper_id) or fallback_by_requested.get(paper_id)
        if not paper:
            continue
        normalized = str(paper.get("paperId") or paper_id).strip() or paper_id
        if normalized in seen_resolved:
            continue
        seen_resolved.add(normalized)
        resolved_papers.append({**paper, "paperId": normalized})

    return resolved_papers


@router.post("/generate")
async def generate_profile(request: Request, body: ProfileGenerateRequest) -> ProfileResponse:
    s2 = request.app.state.s2_client
    oa = request.app.state.oa_client
    cache = request.app.state.cache
    settings = request.app.state.settings
    journal_zone = request.app.state.journal_zone

    paper_ids = body.paper_ids[: settings.max_seeds]
    fallback_seed_papers = body.seed_papers[: settings.max_seeds]
    resolved_seed_papers = await _resolve_seed_papers(request, paper_ids, fallback_seed_papers)
    if not resolved_seed_papers:
        raise HTTPException(status_code=503, detail="Seed papers could not be resolved.")

    resolved_seed_ids = [
        str(paper.get("paperId") or "").strip()
        for paper in resolved_seed_papers
        if str(paper.get("paperId") or "").strip()
    ]

    try:
        papers_with_embeddings = await s2.get_papers_with_embeddings(resolved_seed_ids)
    except SemanticScholarError as exc:
        logger.warning("Profile embedding fetch failed for %s: %s", resolved_seed_ids, exc)
        papers_with_embeddings = []

    papers_with_embeddings_by_id = {
        str(paper.get("paperId") or "").strip(): paper
        for paper in papers_with_embeddings
        if str(paper.get("paperId") or "").strip()
    }
    embeddings = []
    seed_papers = []
    for paper in resolved_seed_papers:
        paper_id = str(paper.get("paperId") or "").strip()
        source_paper = merge_paper_records(paper, papers_with_embeddings_by_id.get(paper_id))
        source_paper = await hydrate_paper_for_journal_metadata(
            source_paper,
            oa_client=oa,
            lookup_hint=paper_id,
        )
        embedding_data = source_paper.get("embedding") or {}
        vector = embedding_data.get("vector") if isinstance(embedding_data, dict) else None
        if vector:
            embeddings.append(vector)

        seed_papers.append(build_paper_summary(source_paper, journal_zone=journal_zone))

    interest_embedding = average_embeddings(embeddings) if embeddings else []

    if interest_embedding:
        cache_key = f"pd:profile:{':'.join(sorted(paper.paper_id for paper in seed_papers if paper.paper_id))}"
        await cache.set_json(cache_key, interest_embedding, settings.cache_ttl_embedding)

    return ProfileResponse(
        embedding=interest_embedding,
        seed_count=len(seed_papers),
        seed_papers=seed_papers,
    )
