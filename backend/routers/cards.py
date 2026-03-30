from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from backend.models.schemas import CardGenerateRequest, CardResponse
from backend.services.paper_metadata import enrich_paper_metadata
from backend.services.semantic_scholar import SemanticScholarError, normalize_authors, resolve_doi, resolve_url
from backend.services.tier_classifier import classify_tier

router = APIRouter(prefix="/cards", tags=["cards"])


@router.post("/generate")
async def generate_card(request: Request, body: CardGenerateRequest) -> CardResponse:
    s2 = request.app.state.s2_client
    oa = request.app.state.oa_client
    card_gen = request.app.state.card_generator
    cache = request.app.state.cache
    settings = request.app.state.settings
    journal_zone = request.app.state.journal_zone

    cache_key = f"pd:card:v3:{body.paper_id}:{body.mode}:{body.language}"
    cached = await cache.get_json(cache_key)
    if cached is not None:
        return CardResponse(**cached)

    try:
        paper = await s2.get_paper(body.paper_id)
    except SemanticScholarError:
        paper = await oa.get_paper_by_lookup(body.paper_id)
        if not paper:
            raise HTTPException(status_code=503, detail="Paper details unavailable.")

    card_content = await card_gen.generate_card(
        paper,
        mode=body.mode,
        language=body.language,
        ai_provider=body.ai_provider,
    )
    title_zh = await card_gen.localize_title(paper.get("title") or "Untitled", "zh")
    metadata = enrich_paper_metadata(paper, journal_zone)
    tier = classify_tier(
        citation_count=paper.get("citationCount") or 0,
        venue=paper.get("venue"),
        year=paper.get("year"),
    )

    response = CardResponse(
        paper_id=paper.get("paperId", ""),
        title=paper.get("title") or "Untitled",
        title_zh=title_zh,
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
        zone=metadata["zone"],
        issn=metadata["issn"],
        eissn=metadata["eissn"],
    )

    await cache.set_json(cache_key, response.model_dump(), settings.cache_ttl_card)
    return response
