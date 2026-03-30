from __future__ import annotations

import asyncio
import random

from fastapi import APIRouter, HTTPException, Request

from backend.models.schemas import (
    GachaRequest,
    GachaResponse,
    PaperSummary,
    RecommendRequest,
    RecommendResponse,
    CardResponse,
)
from backend.services.interest import average_embeddings, rank_papers_by_similarity
from backend.services.paper_metadata import build_digest_summary, enrich_paper_metadata
from backend.services.semantic_scholar import SemanticScholarError, normalize_authors, resolve_doi, resolve_url
from backend.services.tier_classifier import classify_tier

router = APIRouter(prefix="/recommend", tags=["recommend"])


async def resolve_to_s2_ids(request: Request, paper_ids: list[str]) -> list[str]:
    """Resolve DOI:/OA:-prefixed IDs to canonical S2 IDs when possible."""
    if not any(":" in pid for pid in paper_ids):
        return [paper_id for paper_id in paper_ids if paper_id]

    s2 = request.app.state.s2_client
    try:
        resolved = await s2.resolve_paper_ids(paper_ids)
        return [paper_id for paper_id in resolved if paper_id and ":" not in paper_id]
    except SemanticScholarError:
        return [paper_id for paper_id in paper_ids if paper_id and ":" not in paper_id]


async def get_interest_embedding(request: Request, seed_paper_ids: list[str]) -> list[float]:
    cache = request.app.state.cache
    settings = request.app.state.settings
    s2 = request.app.state.s2_client

    cache_key = f"pd:profile:{':'.join(sorted(seed_paper_ids))}"
    cached = await cache.get_json(cache_key)
    if cached is not None:
        return cached

    resolved_seed_ids = await resolve_to_s2_ids(request, seed_paper_ids)
    seed_papers = await s2.get_papers_with_embeddings(resolved_seed_ids)
    embeddings = []
    for paper in seed_papers:
        embedding_data = paper.get("embedding") or {}
        vector = embedding_data.get("vector") if isinstance(embedding_data, dict) else None
        if vector:
            embeddings.append(vector)

    interest_embedding = average_embeddings(embeddings) if embeddings else []
    if interest_embedding:
        await cache.set_json(cache_key, interest_embedding, settings.cache_ttl_embedding)
    return interest_embedding


async def rank_recommendations(
    request: Request,
    raw_papers: list[dict],
    seed_paper_ids: list[str],
) -> list[dict]:
    if not raw_papers:
        return []

    s2 = request.app.state.s2_client
    interest_embedding = await get_interest_embedding(request, seed_paper_ids)
    if not interest_embedding:
        return [{**paper, "similarity_score": 0.0} for paper in raw_papers]

    recommendation_ids = [paper.get("paperId") for paper in raw_papers if paper.get("paperId")]
    papers_with_embeddings = await s2.get_papers_with_embeddings(recommendation_ids)
    embedding_by_id = {
        paper.get("paperId"): paper
        for paper in papers_with_embeddings
        if paper and paper.get("paperId")
    }

    enriched = []
    for paper in raw_papers:
        paper_id = paper.get("paperId")
        enriched.append({**paper, **embedding_by_id.get(paper_id, {})})

    return rank_papers_by_similarity(interest_embedding, enriched)


def _ranked_pool_cache_key(seed_paper_ids: list[str], limit: int) -> str:
    normalized_ids = sorted({paper_id for paper_id in seed_paper_ids if paper_id})
    return f"pd:ranked-pool:v1:{':'.join(normalized_ids)}:{limit}"


async def _get_ranked_recommendation_pool(
    request: Request,
    seed_paper_ids: list[str],
    *,
    limit: int,
    fail_open: bool = False,
) -> tuple[list[str], list[dict]]:
    cache = request.app.state.cache
    settings = request.app.state.settings
    s2 = request.app.state.s2_client

    s2_ids = await resolve_to_s2_ids(request, seed_paper_ids)
    if not s2_ids:
        if fail_open:
            return [], []
        raise HTTPException(status_code=503, detail="Seed papers could not be resolved.")

    cache_key = _ranked_pool_cache_key(s2_ids, limit)
    cached = await cache.get_json(cache_key)

    try:
        raw_papers = await s2.get_recommendations(s2_ids, limit=limit)
        ranked_papers = await rank_recommendations(request, raw_papers, seed_paper_ids)
    except SemanticScholarError as exc:
        if cached is not None:
            return s2_ids, cached
        if fail_open:
            return s2_ids, []
        raise HTTPException(status_code=exc.status_code or 502, detail=str(exc)) from exc

    if ranked_papers:
        await cache.set_json(cache_key, ranked_papers, settings.cache_ttl_recommendation)
        return s2_ids, ranked_papers

    if cached is not None:
        return s2_ids, cached

    return s2_ids, []


async def _build_seed_echo_pool(
    request: Request,
    original_seed_ids: list[str],
    resolved_seed_ids: list[str],
    excluded_ids: set[str],
    fallback_seed_papers: list[PaperSummary] | None = None,
) -> list[dict]:
    s2 = request.app.state.s2_client
    oa = request.app.state.oa_client

    try:
        seed_papers = await s2.get_papers_batch(resolved_seed_ids)
    except SemanticScholarError:
        seed_papers = []

    if not seed_papers:
        lookups = await asyncio.gather(
            *(oa.get_paper_by_lookup(paper_id) for paper_id in original_seed_ids),
            return_exceptions=True,
        )
        seed_papers = [paper for paper in lookups if isinstance(paper, dict)]

    if not seed_papers and fallback_seed_papers:
        seed_papers = [
            {
                "paperId": paper.paper_id,
                "title": paper.title,
                "authors": [{"name": author} for author in paper.authors if author],
                "year": paper.year,
                "citationCount": paper.citation_count or 0,
                "abstract": paper.abstract,
                "venue": paper.venue,
                "externalIds": {"DOI": paper.doi} if paper.doi else {},
                "url": paper.url,
            }
            for paper in fallback_seed_papers
            if paper.paper_id
        ]

    fallback_pool = []
    seen_ids: set[str] = set()
    for paper in seed_papers:
        paper_id = str(paper.get("paperId") or "").strip()
        if not paper_id or paper_id in excluded_ids or paper_id in seen_ids:
            continue
        seen_ids.add(paper_id)
        fallback_pool.append({**paper, "similarity_score": 1.0})

    return fallback_pool


@router.post("")
async def recommend_papers(request: Request, body: RecommendRequest) -> RecommendResponse:
    s2 = request.app.state.s2_client
    cache = request.app.state.cache
    settings = request.app.state.settings
    journal_zone = request.app.state.journal_zone
    card_gen = request.app.state.card_generator

    excluded_ids = {paper_id for paper_id in body.exclude_paper_ids if paper_id}

    cache_key = f"pd:rec:v2:{':'.join(sorted(body.seed_paper_ids))}:{body.limit}:{body.language}"
    cached = await cache.get_json(cache_key)
    if cached is not None:
        papers = [PaperSummary(**p) for p in cached]
        if excluded_ids:
            papers = [p for p in papers if p.paper_id not in excluded_ids]
        if body.year_min:
            papers = [p for p in papers if p.year and p.year >= body.year_min]
        return RecommendResponse(papers=papers)

    s2_ids = await resolve_to_s2_ids(request, body.seed_paper_ids)
    if not s2_ids:
        raise HTTPException(status_code=503, detail="Seed papers could not be resolved.")
    try:
        raw_papers = await s2.get_recommendations(
            s2_ids,
            limit=min(max(body.limit * 4, body.limit), settings.max_recommendations),
        )
    except SemanticScholarError as exc:
        raise HTTPException(status_code=exc.status_code or 502, detail=str(exc)) from exc
    ranked_papers = await rank_recommendations(request, raw_papers, body.seed_paper_ids)
    if excluded_ids:
        ranked_papers = [paper for paper in ranked_papers if paper.get("paperId") not in excluded_ids]

    candidates = []
    for paper in ranked_papers:
        year = paper.get("year")
        if body.year_min and year and year < body.year_min:
            continue
        candidates.append(paper)

    digests = await asyncio.gather(
        *(
            build_digest_summary(
                paper,
                card_generator=card_gen,
                journal_zone=journal_zone,
                similarity=paper.get("similarity_score") or 0.0,
                language=body.language,
            )
            for paper in candidates[: max(body.limit * 3, body.limit)]
        )
    )
    papers = [paper for paper in digests if paper is not None][: body.limit]

    await cache.set_json(cache_key, [p.model_dump() for p in papers], settings.cache_ttl_recommendation)
    return RecommendResponse(papers=papers)


@router.post("/gacha")
async def gacha_draw(request: Request, body: GachaRequest) -> GachaResponse:
    settings = request.app.state.settings
    card_gen = request.app.state.card_generator
    journal_zone = request.app.state.journal_zone

    excluded_ids = {paper_id for paper_id in body.exclude_paper_ids if paper_id}

    pool_limit = min(max(body.count * 10, 40), settings.max_recommendations)
    s2_ids, ranked_papers = await _get_ranked_recommendation_pool(
        request,
        body.seed_paper_ids,
        limit=pool_limit,
        fail_open=True,
    )
    if excluded_ids:
        ranked_papers = [paper for paper in ranked_papers if paper.get("paperId") not in excluded_ids]

    draw_pool = ranked_papers[: max(body.count * 8, body.count)]
    if not draw_pool:
        draw_pool = await _build_seed_echo_pool(
            request,
            body.seed_paper_ids,
            s2_ids,
            excluded_ids,
            body.seed_papers,
        )

    random.shuffle(draw_pool)
    selected = draw_pool[: body.count]

    if not selected:
        return GachaResponse(cards=[])

    cards = []
    for paper in selected:
        metadata = enrich_paper_metadata(paper, journal_zone)
        tier = classify_tier(
            citation_count=paper.get("citationCount") or 0,
            venue=paper.get("venue"),
            year=paper.get("year"),
        )

        card_content = await card_gen.generate_card(
            paper,
            mode=body.mode,
            language=body.language,
            ai_provider=body.ai_provider,
        )
        title_zh = await card_gen.localize_title(paper.get("title") or "Untitled", "zh")

        cards.append(CardResponse(
            paper_id=paper.get("paperId", ""),
            title=paper.get("title") or "Untitled",
            title_zh=title_zh,
            abstract=paper.get("abstract"),
            authors=normalize_authors(paper),
            year=paper.get("year"),
            venue=paper.get("venue"),
            citation_count=paper.get("citationCount") or 0,
            doi=resolve_doi(paper),
            url=resolve_url(paper),
            mode=body.mode,
            language=body.language,
            card_content=card_content,
            tier=tier,
            similarity_score=paper.get("similarity_score") or 0.0,
            zone=metadata["zone"],
            issn=metadata["issn"],
            eissn=metadata["eissn"],
        ))

    return GachaResponse(cards=cards)
