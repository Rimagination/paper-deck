from __future__ import annotations

import asyncio

from fastapi import APIRouter, Query, Request

from backend.models.schemas import PaperSummary
from backend.services.interest import rank_papers_by_similarity
from backend.services.paper_metadata import build_paper_summary
from backend.services.semantic_scholar import SemanticScholarError

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


@router.get("/venues/search")
async def search_venues(
    request: Request,
    q: str = Query(..., min_length=2),
    limit: int = Query(10, ge=1, le=20),
) -> list[dict]:
    oa = request.app.state.oa_client
    cache = request.app.state.cache
    journal_zone = request.app.state.journal_zone
    cache_key = f"pd:venue:{q.lower().strip()}"
    cached = await cache.get_json(cache_key)
    if cached is not None:
        return cached
    raw_results = await oa.search_venues(q.strip(), limit=limit)
    results = [
        {
            **venue,
            "zone": journal_zone.lookup(issn=venue.get("issn"), title=venue.get("name")),
        }
        for venue in raw_results
    ]
    await cache.set_json(cache_key, results, 86_400)  # cache 1 day
    return results


@router.post("/feed")
async def get_subscription_feed(request: Request, body: dict) -> dict:
    """
    body: {
      venue_ids: list[str],          # OpenAlex source short IDs (e.g. "S12345")
      interest_embedding: list[float] | null,
      days_back: int = 30,
      min_similarity: float = 0.0,   # 0 = show all, 0.1 = show >10% match
      limit: int = 20
    }
    """
    oa = request.app.state.oa_client
    s2 = request.app.state.s2_client
    cache = request.app.state.cache
    journal_zone = request.app.state.journal_zone

    venue_ids: list[str] = body.get("venue_ids") or []
    interest_embedding: list[float] | None = body.get("interest_embedding")
    days_back: int = int(body.get("days_back") or 30)
    min_similarity: float = float(body.get("min_similarity") or 0.0)
    limit: int = min(int(body.get("limit") or 20), 50)
    excluded_ids = {paper_id for paper_id in (body.get("exclude_paper_ids") or []) if paper_id}

    if not venue_ids:
        return {"papers": []}

    # Fetch recent papers from each venue concurrently (cap at 8 venues)
    tasks = [
        oa.get_recent_papers_by_venue(vid, days_back=days_back, limit=25)
        for vid in venue_ids[:8]
    ]
    venue_results = await asyncio.gather(*tasks, return_exceptions=True)

    all_papers: list[dict] = []
    seen_ids: set[str] = set()
    for result in venue_results:
        if isinstance(result, list):
            for paper in result:
                pid = paper.get("paperId", "")
                if pid and pid not in seen_ids and pid not in excluded_ids:
                    seen_ids.add(pid)
                    all_papers.append(paper)

    if not all_papers:
        return {"papers": []}

    # If we have an interest embedding, try to enrich with S2 embeddings and rank
    if interest_embedding:
        doi_ids = [p["paperId"] for p in all_papers if p.get("paperId", "").startswith("DOI:")]
        if doi_ids:
            try:
                enriched = await s2.get_papers_batch_with_embeddings(doi_ids)
                enriched_by_id = {p.get("paperId"): p for p in enriched if p and p.get("paperId")}
                # Merge: prefer S2 data when available (includes embedding)
                for i, paper in enumerate(all_papers):
                    pid = paper.get("paperId", "")
                    if pid in enriched_by_id:
                        all_papers[i] = {**paper, **enriched_by_id[pid]}
            except SemanticScholarError:
                pass  # fall through to unranked results

        ranked = rank_papers_by_similarity(interest_embedding, all_papers)
        if min_similarity > 0:
            ranked = [p for p in ranked if p.get("similarity_score", 0) >= min_similarity]
    else:
        ranked = [{**p, "similarity_score": 0.0} for p in all_papers]

    papers = [
        build_paper_summary(
            p,
            journal_zone=journal_zone,
            similarity=p.get("similarity_score", 0.0),
        )
        for p in ranked[:limit]
    ]
    return {"papers": [p.model_dump() for p in papers]}
