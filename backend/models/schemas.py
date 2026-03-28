from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


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


class GachaRequest(BaseModel):
    seed_paper_ids: list[str]
    count: int = 5
    mode: str = "research"
    language: str = "zh"
    exclude_paper_ids: list[str] = Field(default_factory=list)


class CardGenerateRequest(BaseModel):
    paper_id: str
    mode: str = "research"  # "research" or "discovery"
    language: str = "zh"


class ResearchCardContent(BaseModel):
    core_contribution: str = ""
    tech_stack: list[str] = Field(default_factory=list)
    dataset_scale: str = "N/A"
    key_results: str = ""


class DiscoveryCardContent(BaseModel):
    headline: str = ""
    plain_summary: str = ""
    why_it_matters: str = ""
    simplified_tags: list[str] = Field(default_factory=list)


class CardResponse(BaseModel):
    paper_id: str
    title: str
    title_zh: Optional[str] = None
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
