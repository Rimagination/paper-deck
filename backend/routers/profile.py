from __future__ import annotations

import logging

from fastapi import APIRouter, Request

from backend.models.schemas import ProfileGenerateRequest, ProfileResponse
from backend.services.interest import average_embeddings
from backend.services.paper_metadata import build_paper_summary

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/profile", tags=["profile"])


@router.post("/generate")
async def generate_profile(request: Request, body: ProfileGenerateRequest) -> ProfileResponse:
    s2 = request.app.state.s2_client
    cache = request.app.state.cache
    settings = request.app.state.settings
    journal_zone = request.app.state.journal_zone

    paper_ids = body.paper_ids[: settings.max_seeds]

    # Fetch papers with embeddings
    papers = await s2.get_papers_batch_with_embeddings(paper_ids)

    embeddings = []
    seed_papers = []
    for paper in papers:
        embedding_data = paper.get("embedding") or {}
        vector = embedding_data.get("vector") if isinstance(embedding_data, dict) else None
        if vector:
            embeddings.append(vector)

        seed_papers.append(build_paper_summary(paper, journal_zone=journal_zone))

    interest_embedding = average_embeddings(embeddings) if embeddings else []

    if interest_embedding:
        cache_key = f"pd:profile:{':'.join(sorted(paper_ids))}"
        await cache.set_json(cache_key, interest_embedding, settings.cache_ttl_embedding)

    return ProfileResponse(
        embedding=interest_embedding,
        seed_count=len(embeddings),
        seed_papers=seed_papers,
    )
