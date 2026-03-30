from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class AIProviderConfig(BaseModel):
    """User-provided AI provider config sent per request. Never stored server-side."""
    base_url: str
    api_key: str
    model: str


class PaperSummary(BaseModel):
    paper_id: str
    title: str
    title_zh: Optional[str] = None
    authors: list[str]
    year: Optional[int] = None
    citation_count: int = 0
    abstract: Optional[str] = None
    venue: Optional[str] = None
    doi: Optional[str] = None
    url: Optional[str] = None
    similarity_score: float = 0.0
    issn: Optional[str] = None
    eissn: Optional[str] = None
    language: str = "zh"
    card_content: Optional[dict] = None
    zone: Optional[str] = None  # CAS zone: "1区"/"2区"/"3区"/"4区"


class SeedSearchRequest(BaseModel):
    query: str


class ProfileGenerateRequest(BaseModel):
    paper_ids: list[str]


class ProfileResponse(BaseModel):
    embedding: list[float]
    seed_count: int
    seed_papers: list[PaperSummary]


class RecommendRequest(BaseModel):
    seed_paper_ids: list[str]
    limit: int = 20
    year_min: Optional[int] = None
    exclude_paper_ids: list[str] = Field(default_factory=list)
    language: str = "zh"


class GachaRequest(BaseModel):
    seed_paper_ids: list[str]
    count: int = 5
    mode: str = "research"
    language: str = "zh"
    exclude_paper_ids: list[str] = Field(default_factory=list)
    ai_provider: Optional[AIProviderConfig] = None


class CardGenerateRequest(BaseModel):
    paper_id: str
    mode: str = "research"  # "research" or "discovery"
    language: str = "zh"
    ai_provider: Optional[AIProviderConfig] = None


class ResearchCardContent(BaseModel):
    research_question: str = ""
    research_gap: str = ""
    method_snapshot: str = ""
    data_and_evaluation: str = "N/A"
    key_findings: str = ""
    innovation: str = ""
    next_step: str = "N/A"
    evidence_signals: list[str] = Field(default_factory=list)
    core_contribution: str = ""
    problem_statement: str = ""
    methods: str = ""
    tech_stack: list[str] = Field(default_factory=list)
    dataset_scale: str = "N/A"
    key_results: str = ""
    novelty: str = ""
    limitations: str = "N/A"


class DiscoveryCardContent(BaseModel):
    headline: str = ""
    plain_summary: str = ""
    key_insight: str = ""
    why_it_matters: str = ""
    who_should_read: str = ""
    read_if: str = ""
    quick_takeaways: list[str] = Field(default_factory=list)
    simplified_tags: list[str] = Field(default_factory=list)


class CardResponse(BaseModel):
    paper_id: str
    title: str
    title_zh: Optional[str] = None
    abstract: Optional[str] = None
    authors: list[str]
    year: Optional[int] = None
    venue: Optional[str] = None
    citation_count: int = 0
    doi: Optional[str] = None
    url: Optional[str] = None
    mode: str
    language: str = "zh"
    card_content: dict
    tier: str
    similarity_score: float = 0.0
    zone: Optional[str] = None
    issn: Optional[str] = None
    eissn: Optional[str] = None


class RecommendResponse(BaseModel):
    papers: list[PaperSummary]


class GachaResponse(BaseModel):
    cards: list[CardResponse]
