from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from backend.models.schemas import CardResponse, GachaRequest, PaperSummary
from backend.routers.recommend import gacha_draw
from backend.routers.subscriptions import get_subscription_feed


class RecommendAndSubscriptionBehaviorTests(unittest.IsolatedAsyncioTestCase):
    async def test_gacha_draw_falls_back_to_related_venue_papers_when_ranked_pool_is_empty(self) -> None:
        related_paper = {
            "paperId": "rec-1",
            "title": "Fresh Paper",
            "authors": [{"name": "B. Author"}],
            "abstract": "B" * 120,
            "venue": "Seed Venue",
            "year": 2025,
            "citationCount": 3,
            "issn": "1111-1111",
        }
        request = SimpleNamespace(
            app=SimpleNamespace(
                state=SimpleNamespace(
                    settings=SimpleNamespace(max_recommendations=100),
                    card_generator=object(),
                    s2_client=SimpleNamespace(
                        get_papers_batch=AsyncMock(
                            return_value=[
                                {
                                    "paperId": "seed-1",
                                    "title": "Seed Paper",
                                    "authors": [{"name": "A. Author"}],
                                    "abstract": "A" * 120,
                                    "venue": "Seed Venue",
                                    "year": 2024,
                                    "citationCount": 1,
                                    "issn": "1111-1111",
                                }
                            ]
                        )
                    ),
                    oa_client=SimpleNamespace(
                        get_paper_by_lookup=AsyncMock(return_value=None),
                        search_venues=AsyncMock(
                            return_value=[{"id": "S-seed-venue", "name": "Seed Venue", "issn": "1111-1111"}]
                        ),
                        get_recent_papers_by_venue=AsyncMock(return_value=[related_paper]),
                    ),
                    journal_zone=None,
                )
            )
        )
        body = GachaRequest(
            seed_paper_ids=["seed-1"],
            seed_papers=[
                PaperSummary(
                    paper_id="seed-1",
                    title="Seed Paper",
                    authors=["A. Author"],
                    abstract="A" * 120,
                    venue="Seed Venue",
                    year=2024,
                    issn="1111-1111",
                )
            ],
            count=1,
            mode="research",
            language="zh",
        )

        with (
            patch(
                "backend.routers.recommend._get_ranked_recommendation_pool",
                new=AsyncMock(return_value=(["seed-1"], [])),
            ),
            patch(
                "backend.routers.recommend._build_card_response",
                new=AsyncMock(
                    return_value=CardResponse(
                        paper_id="rec-1",
                        title="Fresh Paper",
                        authors=["B. Author"],
                        abstract="B" * 120,
                        year=2025,
                        venue="Seed Venue",
                        citation_count=3,
                        doi=None,
                        url=None,
                        mode="research",
                        language="zh",
                        card_content={"headline": "fresh"},
                        tier="N",
                        similarity_score=0.7,
                    )
                ),
            ),
        ):
            response = await gacha_draw(request, body)

        self.assertEqual(len(response.cards), 1)
        self.assertEqual(
            response.cards[0].paper_id,
            "rec-1",
            "When the ranked recommendation pool is empty, gacha should fall back to related venue papers instead of going empty immediately.",
        )

    async def test_gacha_draw_does_not_recycle_seed_papers_when_ranked_pool_is_empty(self) -> None:
        request = SimpleNamespace(
            app=SimpleNamespace(
                state=SimpleNamespace(
                    settings=SimpleNamespace(max_recommendations=100),
                    card_generator=object(),
                    s2_client=SimpleNamespace(get_papers_batch=AsyncMock(return_value=[])),
                    oa_client=SimpleNamespace(get_paper_by_lookup=AsyncMock(return_value=None)),
                    journal_zone=None,
                )
            )
        )
        body = GachaRequest(
            seed_paper_ids=["seed-1"],
            seed_papers=[
                PaperSummary(
                    paper_id="seed-1",
                    title="Seed Paper",
                    authors=["A. Author"],
                    abstract="A" * 120,
                    venue="Seed Venue",
                    year=2024,
                )
            ],
            count=1,
            mode="research",
            language="zh",
        )

        fallback_seed_card = {
            "paperId": "seed-1",
            "title": "Seed Paper",
            "authors": [{"name": "A. Author"}],
            "abstract": "A" * 120,
            "venue": "Seed Venue",
            "year": 2024,
            "citationCount": 1,
        }

        with (
            patch(
                "backend.routers.recommend._get_ranked_recommendation_pool",
                new=AsyncMock(return_value=(["seed-1"], [])),
            ),
            patch(
                "backend.routers.recommend._build_seed_echo_pool",
                new=AsyncMock(return_value=[fallback_seed_card]),
            ),
            patch(
                "backend.routers.recommend._build_card_response",
                new=AsyncMock(
                    return_value=CardResponse(
                        paper_id="seed-1",
                        title="Seed Paper",
                        authors=["A. Author"],
                        abstract="A" * 120,
                        year=2024,
                        venue="Seed Venue",
                        citation_count=1,
                        doi=None,
                        url=None,
                        mode="research",
                        language="zh",
                        card_content={"headline": "seed"},
                        tier="N",
                        similarity_score=1.0,
                    )
                ),
            ),
        ):
            response = await gacha_draw(request, body)

        self.assertEqual(
            response.cards,
            [],
            "When no recommendation pool exists, gacha should not fall back to the seed papers themselves.",
        )

    async def test_subscription_feed_preserves_subscribed_venue_after_s2_enrichment(self) -> None:
        oa_paper = {
            "paperId": "paper-1",
            "title": "Original Paper",
            "authors": [{"name": "A. Author"}],
            "year": 2024,
            "citationCount": 8,
            "abstract": "原始摘要" * 60,
            "venue": "Journal of Subscribed Things",
            "issn": "1111-1111",
            "eissn": "2222-2222",
        }
        s2_paper = {
            "paperId": "paper-1",
            "title": "Original Paper",
            "authors": [{"name": "A. Author"}],
            "year": 2024,
            "citationCount": 8,
            "abstract": "原始摘要" * 60,
            "venue": "Completely Different Venue",
            "embedding": {"vector": [1.0, 0.0]},
        }

        request = SimpleNamespace(
            app=SimpleNamespace(
                state=SimpleNamespace(
                    oa_client=SimpleNamespace(
                        get_recent_papers_by_venue=AsyncMock(return_value=[oa_paper]),
                    ),
                    s2_client=SimpleNamespace(
                        get_papers_with_embeddings=AsyncMock(return_value=[s2_paper]),
                    ),
                    cache=SimpleNamespace(),
                    journal_zone=None,
                    card_generator=SimpleNamespace(
                        localize_title=AsyncMock(return_value="原始论文"),
                        generate_card=AsyncMock(
                            return_value={
                                "plain_summary": "这是一段足够长的中文摘要内容，用于验证订阅流在 enrich 之后不会把原始期刊来源覆盖掉。",
                            }
                        ),
                    ),
                )
            )
        )

        response = await get_subscription_feed(
            request,
            {
                "venue_ids": ["S-venue-1"],
                "interest_embedding": [1.0, 0.0],
                "days_back": 30,
                "min_similarity": 0.0,
                "limit": 5,
                "language": "zh",
            },
        )

        self.assertEqual(len(response["papers"]), 1)
        self.assertEqual(
            response["papers"][0]["venue"],
            "Journal of Subscribed Things",
            "Subscription feed should keep the subscribed venue label instead of replacing it with the S2 venue text.",
        )


if __name__ == "__main__":
    unittest.main()
