from __future__ import annotations

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Semantic Scholar
    semantic_scholar_api_key: str | None = None
    semantic_scholar_base_url: str = "https://api.semanticscholar.org/graph/v1"
    semantic_scholar_rec_url: str = "https://api.semanticscholar.org/recommendations/v1/papers/"
    semantic_scholar_timeout: float = 15.0
    request_concurrency: int = 4
    request_max_retries: int = 1
    request_backoff_base: float = 0.2
    source_cooldown_seconds: int = 30

    # Cache
    redis_url: str | None = None
    cache_ttl_search: int = 86_400
    cache_ttl_embedding: int = 604_800
    cache_ttl_recommendation: int = 43_200
    cache_ttl_card: int = 2_592_000

    # Journal metadata
    journal_zone_index_path: str | None = None

    # AI card generation (Qiniu / StepFun)
    qnaigc_api_key: str | None = None
    qnaigc_base_url: str = "https://api.qnaigc.com/v1"
    qnaigc_model: str = "stepfun/step-3.5-flash"

    # App
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173", "*"]
    max_seeds: int = 20
    max_recommendations: int = 100
    default_draw_count: int = 5
    user_agent: str = "PaperDeck/1.0"

    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_cors_origins(cls, value):
        if value is None:
            return ["*"]
        if isinstance(value, str):
            if not value.strip():
                return ["*"]
            return [item.strip() for item in value.split(",") if item.strip()]
        if isinstance(value, list):
            return value
        return ["*"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
