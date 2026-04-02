from __future__ import annotations

import asyncio
import random
import re

from fastapi import APIRouter, HTTPException, Request

from backend.models.schemas import (
    GachaRequest,
    GachaResponse,
    PaperSummary,
    RecommendRequest,
    RecommendResponse,
    CardResponse,
)
from backend.services.interest import average_embeddings, rank_papers_by_similarity, rank_papers_by_text_similarity
from backend.services.paper_metadata import (
    build_digest_summary,
    enrich_paper_metadata,
    hydrate_paper_for_journal_metadata,
    merge_paper_records,
)
from backend.services.semantic_scholar import SemanticScholarError, normalize_authors, resolve_doi, resolve_url
from backend.services.tier_classifier import classify_tier

router = APIRouter(prefix="/recommend", tags=["recommend"])

GACHA_MIN_SIMILARITY = 0.2
_SEED_SEARCH_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z-]{3,}")
_SEED_SEARCH_STOPWORDS = {
    "about",
    "across",
    "after",
    "analysis",
    "beyond",
    "between",
    "change",
    "changes",
    "effect",
    "effects",
    "global",
    "priorities",
    "priority",
    "review",
    "scenario",
    "scenarios",
    "study",
    "studies",
    "their",
    "these",
    "this",
    "under",
    "using",
    "with",
    "year",
}


def _normalize_match_key(value: str | None) -> str:
    return " ".join(str(value or "").split()).strip().casefold()


def _normalize_issn(value: str | None) -> str:
    return str(value or "").strip().upper()


def _paper_source_fields(paper: dict | PaperSummary) -> tuple[str | None, str | None, str | None]:
    if isinstance(paper, PaperSummary):
        return paper.venue, paper.issn, paper.eissn
    return paper.get("venue"), paper.get("issn"), paper.get("eissn")


def _paper_summary_to_similarity_dict(paper: PaperSummary) -> dict:
    return {
        "paperId": paper.paper_id,
        "title": paper.title,
        "authors": [{"name": author} for author in paper.authors if author],
        "year": paper.year,
        "citationCount": paper.citation_count or 0,
        "abstract": paper.abstract,
        "venue": paper.venue,
        "externalIds": {"DOI": paper.doi} if paper.doi else {},
        "url": paper.url,
        "issn": paper.issn,
        "eissn": paper.eissn,
    }


def _similarity_paper_key(paper: dict) -> str:
    paper_id = str(paper.get("paperId") or "").strip()
    if paper_id:
        return paper_id
    title_key = _normalize_match_key(paper.get("title"))
    if title_key:
        return f"title:{title_key}"
    return ""


def _choose_related_venue_source(venue_matches: list[dict], venue_name: str | None, issn: str | None, eissn: str | None) -> dict | None:
    if not venue_matches:
        return None

    issn_candidates = {_normalize_issn(issn), _normalize_issn(eissn)} - {""}
    if issn_candidates:
        for match in venue_matches:
            if _normalize_issn(match.get("issn")) in issn_candidates:
                return match

    target_name = _normalize_match_key(venue_name)
    if target_name:
        for match in venue_matches:
            if _normalize_match_key(match.get("name")) == target_name:
                return match

    return venue_matches[0]


def _filter_gacha_candidates(papers: list[dict]) -> list[dict]:
    filtered: list[dict] = []
    for paper in papers:
        score = paper.get("similarity_score")
        if isinstance(score, (int, float)) and score >= GACHA_MIN_SIMILARITY:
            filtered.append(paper)
    return filtered


def _seed_search_queries(seed_papers: list[dict], limit: int = 4) -> list[str]:
    queries: list[str] = []
    seen_queries: set[str] = set()

    for paper in seed_papers:
        title = " ".join(str(paper.get("title") or "").split()).strip(" .")
        if len(title) >= 8:
            normalized_title = title.casefold()
            if normalized_title not in seen_queries:
                queries.append(title[:180])
                seen_queries.add(normalized_title)
        if len(queries) >= limit:
            return queries

    keyword_counts: dict[str, int] = {}
    for paper in seed_papers:
        text = " ".join(
            str(part or "")
            for part in (paper.get("title"), paper.get("abstract"), paper.get("venue"))
        )
        for token in _SEED_SEARCH_TOKEN_RE.findall(text):
            normalized = token.casefold()
            if normalized in _SEED_SEARCH_STOPWORDS:
                continue
            keyword_counts[normalized] = keyword_counts.get(normalized, 0) + 1

    top_keywords = [
        token
        for token, _ in sorted(keyword_counts.items(), key=lambda item: (-item[1], item[0]))
        if token not in seen_queries
    ][:6]
    if top_keywords:
        queries.append(" ".join(top_keywords))

    return queries[:limit]


async def _build_card_response(
    *,
    paper: dict,
    body: GachaRequest,
    card_gen,
    oa_client,
    journal_zone,
) -> CardResponse:
    paper = await hydrate_paper_for_journal_metadata(paper, oa_client=oa_client)
    metadata = enrich_paper_metadata(paper, journal_zone)
    tier = classify_tier(
        citation_count=paper.get("citationCount") or 0,
        venue=paper.get("venue"),
        year=paper.get("year"),
    )

    card_content, title_zh = await asyncio.gather(
        card_gen.generate_card(
            paper,
            mode=body.mode,
            language=body.language,
            ai_provider=body.ai_provider,
        ),
        card_gen.localize_title(paper.get("title") or "Untitled", "zh"),
    )

    return CardResponse(
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
        impact_factor=metadata["impact_factor"],
        is_ni=bool(metadata["is_ni"]),
        issn=metadata["issn"],
        eissn=metadata["eissn"],
    )


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
    try:
        seed_papers = await s2.get_papers_with_embeddings(resolved_seed_ids)
    except SemanticScholarError:
        return []
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


async def _resolve_similarity_seed_papers(
    request: Request,
    seed_paper_ids: list[str],
    fallback_seed_papers: list[PaperSummary] | None = None,
) -> list[dict]:
    s2 = request.app.state.s2_client
    oa = request.app.state.oa_client

    resolved: dict[str, dict] = {}
    if fallback_seed_papers:
        for paper in fallback_seed_papers:
            if not paper.paper_id:
                continue
            resolved[paper.paper_id] = _paper_summary_to_similarity_dict(paper)

    resolved_seed_ids = await resolve_to_s2_ids(request, seed_paper_ids)
    if resolved_seed_ids:
        try:
            fetched_seed_papers = await s2.get_papers_batch(resolved_seed_ids)
        except SemanticScholarError:
            fetched_seed_papers = []
        for paper in fetched_seed_papers:
            paper_id = str(paper.get("paperId") or "").strip()
            if not paper_id:
                continue
            existing = resolved.get(paper_id)
            resolved[paper_id] = merge_paper_records(existing, paper) if existing else paper

    external_seed_ids = [paper_id for paper_id in seed_paper_ids if ":" in str(paper_id or "")]
    if external_seed_ids:
        lookups = await asyncio.gather(
            *(oa.get_paper_by_lookup(paper_id) for paper_id in external_seed_ids),
            return_exceptions=True,
        )
        for original_id, paper in zip(external_seed_ids, lookups):
            if not isinstance(paper, dict):
                continue
            paper_id = str(paper.get("paperId") or original_id).strip() or original_id
            existing = resolved.get(paper_id) or resolved.get(original_id)
            resolved.pop(original_id, None)
            resolved[paper_id] = merge_paper_records(existing, {**paper, "paperId": paper_id}) if existing else {**paper, "paperId": paper_id}

    return [paper for paper in resolved.values() if paper.get("title") or paper.get("abstract")]


async def rank_recommendations(
    request: Request,
    raw_papers: list[dict],
    seed_paper_ids: list[str],
    fallback_seed_papers: list[PaperSummary] | None = None,
) -> list[dict]:
    if not raw_papers:
        return []

    s2 = request.app.state.s2_client
    interest_embedding = await get_interest_embedding(request, seed_paper_ids)
    seed_papers: list[dict] | None = None

    async def rank_by_text_similarity() -> list[dict]:
        nonlocal seed_papers
        if seed_papers is None:
            seed_papers = await _resolve_similarity_seed_papers(request, seed_paper_ids, fallback_seed_papers)
        if not seed_papers:
            return [{**paper, "similarity_score": 0.0} for paper in raw_papers]
        return rank_papers_by_text_similarity(seed_papers, raw_papers)

    if not interest_embedding:
        return await rank_by_text_similarity()

    recommendation_ids = [paper.get("paperId") for paper in raw_papers if paper.get("paperId")]
    try:
        papers_with_embeddings = await s2.get_papers_with_embeddings(recommendation_ids)
    except SemanticScholarError:
        return await rank_by_text_similarity()

    embedding_by_id = {
        paper.get("paperId"): paper
        for paper in papers_with_embeddings
        if paper and paper.get("paperId")
    }

    enriched = []
    for paper in raw_papers:
        paper_id = paper.get("paperId")
        enriched.append(merge_paper_records(paper, embedding_by_id.get(paper_id)))

    ranked = rank_papers_by_similarity(interest_embedding, enriched)
    if not any((paper.get("similarity_score") or 0.0) <= 0.0 for paper in ranked):
        return ranked

    if seed_papers is None:
        seed_papers = await _resolve_similarity_seed_papers(request, seed_paper_ids, fallback_seed_papers)
    if not seed_papers:
        return ranked

    text_ranked = rank_papers_by_text_similarity(seed_papers, enriched)
    text_scores = {}
    for paper in text_ranked:
        key = _similarity_paper_key(paper)
        if key:
            text_scores[key] = paper.get("similarity_score") or 0.0

    backfilled = []
    for paper in ranked:
        score = paper.get("similarity_score") or 0.0
        if score > 0.0:
            backfilled.append(paper)
            continue
        key = _similarity_paper_key(paper)
        backfilled.append({**paper, "similarity_score": text_scores.get(key, 0.0)})

    backfilled.sort(key=lambda paper: paper.get("similarity_score") or 0.0, reverse=True)
    return backfilled


def _ranked_pool_cache_key(seed_paper_ids: list[str], limit: int) -> str:
    normalized_ids = sorted({paper_id for paper_id in seed_paper_ids if paper_id})
    return f"pd:ranked-pool:v1:{':'.join(normalized_ids)}:{limit}"


async def _get_ranked_recommendation_pool(
    request: Request,
    seed_paper_ids: list[str],
    *,
    limit: int,
    fail_open: bool = False,
    fallback_seed_papers: list[PaperSummary] | None = None,
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
        ranked_papers = await rank_recommendations(request, raw_papers, seed_paper_ids, fallback_seed_papers)
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

    keyword_queries = _seed_search_queries(seed_papers)
    venue_queries: list[tuple[str, str | None, str | None]] = []
    seen_venues: set[str] = set()
    for paper in seed_papers:
        venue_name, issn, eissn = _paper_source_fields(paper)
        normalized_name = _normalize_match_key(venue_name)
        if not normalized_name or normalized_name in seen_venues:
            continue
        seen_venues.add(normalized_name)
        venue_queries.append((venue_name, issn, eissn))

    fallback_pool = []
    seen_ids: set[str] = set()
    for venue_name, issn, eissn in venue_queries[:6]:
        venue_matches = await oa.search_venues(venue_name, limit=5)
        selected_source = _choose_related_venue_source(venue_matches, venue_name, issn, eissn)
        if not selected_source:
            continue

        related_papers = await oa.get_recent_papers_by_venue(selected_source["id"], days_back=365, limit=25)
        for paper in related_papers:
            paper_id = str(paper.get("paperId") or "").strip()
            if not paper_id or paper_id in excluded_ids or paper_id in seen_ids:
                continue
            seen_ids.add(paper_id)
            fallback_pool.append({**paper, "similarity_score": paper.get("similarity_score") or 0.0})

    search_papers = getattr(oa, "search_papers", None)
    if callable(search_papers):
        for query in keyword_queries:
            related_papers = await search_papers(query, limit=15)
            for paper in related_papers:
                paper_id = str(paper.get("paperId") or "").strip()
                if not paper_id or paper_id in excluded_ids or paper_id in seen_ids:
                    continue
                seen_ids.add(paper_id)
                fallback_pool.append({**paper, "similarity_score": paper.get("similarity_score") or 0.0})

    if not fallback_pool:
        return []

    try:
        return await rank_recommendations(request, fallback_pool, original_seed_ids, fallback_seed_papers)
    except SemanticScholarError:
        return []


@router.post("")
async def recommend_papers(request: Request, body: RecommendRequest) -> RecommendResponse:
    s2 = request.app.state.s2_client
    cache = request.app.state.cache
    settings = request.app.state.settings
    journal_zone = request.app.state.journal_zone
    card_gen = request.app.state.card_generator

    excluded_ids = {paper_id for paper_id in body.exclude_paper_ids if paper_id}

    cache_key = f"pd:rec:v4:{':'.join(sorted(body.seed_paper_ids))}:{body.limit}:{body.language}"
    oa = request.app.state.oa_client
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
                oa_client=oa,
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
    oa = request.app.state.oa_client
    journal_zone = request.app.state.journal_zone

    seed_ids = {paper_id for paper_id in body.seed_paper_ids if paper_id}
    excluded_ids = {paper_id for paper_id in body.exclude_paper_ids if paper_id} | seed_ids

    pool_limit = min(max(body.count * 10, 40), settings.max_recommendations)
    s2_ids, ranked_papers = await _get_ranked_recommendation_pool(
        request,
        body.seed_paper_ids,
        limit=pool_limit,
        fail_open=True,
        fallback_seed_papers=body.seed_papers,
    )
    if excluded_ids:
        ranked_papers = [paper for paper in ranked_papers if paper.get("paperId") not in excluded_ids]
    ranked_papers = _filter_gacha_candidates(ranked_papers)

    draw_pool = ranked_papers[: max(body.count * 8, body.count)]
    if not draw_pool:
        draw_pool = await _build_seed_echo_pool(
            request,
            body.seed_paper_ids,
            s2_ids,
            excluded_ids,
            body.seed_papers,
        )
        if excluded_ids:
            draw_pool = [paper for paper in draw_pool if paper.get("paperId") not in excluded_ids]
        draw_pool = _filter_gacha_candidates(draw_pool)

    random.shuffle(draw_pool)
    selected = draw_pool[: body.count]

    if not selected:
        return GachaResponse(cards=[])

    cards = await asyncio.gather(
        *(
            _build_card_response(
                paper=paper,
                body=body,
                card_gen=card_gen,
                oa_client=oa,
                journal_zone=journal_zone,
            )
            for paper in selected
        )
    )

    return GachaResponse(cards=cards)
