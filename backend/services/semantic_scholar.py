from __future__ import annotations

import asyncio
import re
import time
from typing import Any
from urllib.parse import parse_qs, quote, unquote, urlparse

import httpx

from backend.config import Settings

SEARCH_FIELDS = "paperId,title,authors,year,citationCount,abstract,venue,externalIds,url"
EMBEDDING_FIELDS = "paperId,title,authors,year,citationCount,abstract,venue,externalIds,url,embedding.specter_v2"
BATCH_FIELDS = "paperId,title,authors,year,citationCount,abstract,venue,externalIds,url"
DOI_PATTERN = re.compile(r"10\.\d{4,9}/[-._;()/:A-Z0-9]+", re.IGNORECASE)


class SemanticScholarNotFoundError(Exception):
    pass


class SemanticScholarError(Exception):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class SemanticScholarClient:
    def __init__(self, settings: Settings) -> None:
        headers = {"User-Agent": settings.user_agent}
        if settings.semantic_scholar_api_key:
            headers["x-api-key"] = settings.semantic_scholar_api_key

        self.client = httpx.AsyncClient(
            base_url=settings.semantic_scholar_base_url,
            headers=headers,
            timeout=settings.semantic_scholar_timeout,
        )
        self.rec_url = settings.semantic_scholar_rec_url
        self.semaphore = asyncio.Semaphore(settings.request_concurrency)
        self.max_retries = settings.request_max_retries
        self.backoff_base = settings.request_backoff_base
        self.cooldown_seconds = settings.source_cooldown_seconds
        self.unavailable_until = 0.0

    async def close(self) -> None:
        await self.client.aclose()

    async def search_papers(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        payload = await self._request(
            "GET",
            "/paper/search",
            params={"query": query, "fields": SEARCH_FIELDS, "limit": limit},
        )
        return payload.get("data", [])

    async def get_paper(self, paper_id: str, fields: str = SEARCH_FIELDS) -> dict[str, Any]:
        if ":" not in paper_id:
            papers = await self.get_papers_batch([paper_id], fields=fields)
            if papers:
                return papers[0]
            raise SemanticScholarNotFoundError("Paper not found.")

        encoded_id = quote(paper_id, safe="")
        return await self._request("GET", f"/paper/{encoded_id}", params={"fields": fields})

    async def get_paper_with_embedding(self, paper_id: str) -> dict[str, Any]:
        return await self.get_paper(paper_id, fields=EMBEDDING_FIELDS)

    async def get_papers_batch(self, ids: list[str], fields: str = BATCH_FIELDS) -> list[dict[str, Any]]:
        if not ids:
            return []

        results: list[dict[str, Any]] = []
        for start in range(0, len(ids), 500):
            chunk = ids[start : start + 500]
            payload = await self._request("POST", "/paper/batch", params={"fields": fields}, json={"ids": chunk})
            results.extend(item for item in payload if item and item.get("paperId"))
        return results

    async def get_papers_batch_with_embeddings(self, ids: list[str]) -> list[dict[str, Any]]:
        return await self.get_papers_batch(ids, fields=EMBEDDING_FIELDS)

    async def get_recommendations(self, positive_paper_ids: list[str], limit: int = 20) -> list[dict[str, Any]]:
        """Use the S2 Recommendations API."""
        payload = await self._request(
            "POST",
            self.rec_url,
            params={"fields": SEARCH_FIELDS, "limit": limit},
            json={"positivePaperIds": positive_paper_ids},
        )
        return payload.get("recommendedPapers", [])

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        if self.unavailable_until > time.monotonic():
            raise SemanticScholarError("Semantic Scholar temporarily unavailable.", status_code=503)

        async with self.semaphore:
            for attempt in range(self.max_retries + 1):
                try:
                    response = await self.client.request(method, path, **kwargs)
                except httpx.RequestError as exc:
                    if attempt < self.max_retries:
                        await asyncio.sleep(self.backoff_base * (2**attempt))
                        continue
                    self._enter_cooldown()
                    raise SemanticScholarError("Unable to reach Semantic Scholar.") from exc

                if response.status_code == 404:
                    raise SemanticScholarNotFoundError("Paper not found.")

                if response.status_code in {429, 500, 502, 503, 504} and attempt < self.max_retries:
                    await asyncio.sleep(self.backoff_base * (2**attempt))
                    continue

                if response.is_error:
                    if response.status_code in {429, 500, 502, 503, 504}:
                        self._enter_cooldown()
                    raise SemanticScholarError(
                        f"Request failed with status {response.status_code}.",
                        status_code=response.status_code,
                    )

                return response.json()

        self._enter_cooldown()
        raise SemanticScholarError("Request failed after retries.")

    def _enter_cooldown(self) -> None:
        self.unavailable_until = time.monotonic() + self.cooldown_seconds


def normalize_authors(paper: dict[str, Any]) -> list[str]:
    authors = paper.get("authors") or []
    return [author.get("name", "").strip() for author in authors if author.get("name")]


def resolve_doi(paper: dict[str, Any]) -> str | None:
    external_ids = paper.get("externalIds") or {}
    return external_ids.get("DOI") or external_ids.get("doi")


def resolve_url(paper: dict[str, Any]) -> str | None:
    doi = resolve_doi(paper)
    if doi:
        return f"https://doi.org/{doi}"
    if paper.get("url"):
        return paper["url"]
    if paper.get("paperId"):
        return f"https://www.semanticscholar.org/paper/{paper['paperId']}"
    return None


def extract_doi(value: str | None) -> str | None:
    if not value:
        return None

    match = DOI_PATTERN.search(unquote(value))
    if not match:
        return None

    return match.group(0).rstrip(".,;:)]}>")


def resolve_lookup_input(raw_input: str | None) -> str | None:
    if not raw_input:
        return None

    candidate = raw_input.strip().strip("<>\"'")
    if not candidate:
        return None

    doi = extract_doi(candidate)
    if doi:
        return f"DOI:{doi}"

    normalized_candidate = candidate
    if "://" not in normalized_candidate and normalized_candidate.startswith(
        ("doi.org/", "dx.doi.org/", "semanticscholar.org/", "www.semanticscholar.org/")
    ):
        normalized_candidate = f"https://{normalized_candidate}"

    parsed = urlparse(normalized_candidate)
    if parsed.scheme and parsed.netloc:
        paper_id = extract_semantic_scholar_paper_id(parsed)
        if paper_id:
            return paper_id

        query_paper_id = parse_qs(parsed.query).get("paperId", [None])[0]
        if query_paper_id:
            return query_paper_id.strip()

    if any(character.isspace() for character in candidate):
        return None

    if candidate.upper().startswith("DOI:"):
        doi = extract_doi(candidate[4:]) or candidate[4:].strip()
        return f"DOI:{doi}" if doi else None

    return candidate.rstrip("/")


def extract_semantic_scholar_paper_id(parsed_url: Any) -> str | None:
    host = (parsed_url.netloc or "").lower().split(":")[0]
    if not host.endswith("semanticscholar.org"):
        return None

    path_parts = [segment for segment in parsed_url.path.split("/") if segment]
    if not path_parts:
        return None

    if path_parts[0] == "paper" and len(path_parts) >= 2:
        return path_parts[-1].strip()

    return None
