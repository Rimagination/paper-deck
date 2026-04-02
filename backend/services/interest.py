from __future__ import annotations

import math
import re
from typing import Any


_SIMILARITY_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9-]{2,}|[\u4e00-\u9fff]{2,}")
_SIMILARITY_STOPWORDS = {
    "about",
    "across",
    "after",
    "among",
    "analysis",
    "approach",
    "approaches",
    "based",
    "before",
    "between",
    "during",
    "effect",
    "effects",
    "from",
    "into",
    "method",
    "methods",
    "paper",
    "result",
    "results",
    "review",
    "reviews",
    "study",
    "studies",
    "system",
    "systems",
    "their",
    "these",
    "this",
    "those",
    "through",
    "under",
    "using",
    "with",
    "within",
    "year",
    "years",
}


def average_embeddings(embeddings: list[list[float]]) -> list[float]:
    """Compute the element-wise average of multiple embedding vectors."""
    if not embeddings:
        return []

    dim = len(embeddings[0])
    result = [0.0] * dim
    for emb in embeddings:
        for i in range(dim):
            result[i] += emb[i]

    n = len(embeddings)
    return [v / n for v in result]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    if len(a) != len(b) or not a:
        return 0.0

    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))

    if norm_a == 0 or norm_b == 0:
        return 0.0

    return dot / (norm_a * norm_b)


def _normalize_similarity_token(token: str) -> str:
    normalized = token.casefold().strip("-_")
    if len(normalized) <= 2:
        return ""
    if normalized.endswith("ies") and len(normalized) > 5:
        normalized = f"{normalized[:-3]}y"
    elif normalized.endswith("ing") and len(normalized) > 5:
        normalized = normalized[:-3]
    elif normalized.endswith("ed") and len(normalized) > 4:
        normalized = normalized[:-2]
    elif normalized.endswith("s") and len(normalized) > 4 and not normalized.endswith("ss"):
        normalized = normalized[:-1]
    if normalized in _SIMILARITY_STOPWORDS:
        return ""
    return normalized


def _tokenize_similarity_text(value: Any) -> set[str]:
    tokens: set[str] = set()
    for raw_token in _SIMILARITY_TOKEN_RE.findall(str(value or "")):
        normalized = _normalize_similarity_token(raw_token)
        if normalized:
            tokens.add(normalized)
    return tokens


def _paper_similarity_token_sets(paper: dict[str, Any]) -> tuple[set[str], set[str], set[str]]:
    return (
        _tokenize_similarity_text(paper.get("title")),
        _tokenize_similarity_text(paper.get("abstract")),
        _tokenize_similarity_text(paper.get("venue")),
    )


def _overlap_ratio(candidate_tokens: set[str], seed_tokens: set[str]) -> float:
    if not candidate_tokens or not seed_tokens:
        return 0.0
    return len(candidate_tokens & seed_tokens) / len(candidate_tokens)


def rank_papers_by_similarity(
    interest_embedding: list[float],
    papers: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Rank papers by cosine similarity to the interest embedding."""
    scored = []
    for paper in papers:
        embedding = paper.get("embedding", {})
        if isinstance(embedding, dict):
            vector = embedding.get("vector") or []
        elif isinstance(embedding, list):
            vector = embedding
        else:
            vector = []

        if not vector:
            scored.append({**paper, "similarity_score": 0.0})
            continue

        score = cosine_similarity(interest_embedding, vector)
        scored.append({**paper, "similarity_score": score})

    scored.sort(key=lambda p: p["similarity_score"], reverse=True)
    return scored


def rank_papers_by_text_similarity(
    seed_papers: list[dict[str, Any]],
    papers: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    seed_title_tokens: set[str] = set()
    seed_abstract_tokens: set[str] = set()
    seed_venue_tokens: set[str] = set()
    for seed_paper in seed_papers:
        title_tokens, abstract_tokens, venue_tokens = _paper_similarity_token_sets(seed_paper)
        seed_title_tokens.update(title_tokens)
        seed_abstract_tokens.update(abstract_tokens)
        seed_venue_tokens.update(venue_tokens)

    scored = []
    for paper in papers:
        title_tokens, abstract_tokens, venue_tokens = _paper_similarity_token_sets(paper)
        title_score = _overlap_ratio(title_tokens, seed_title_tokens)
        abstract_score = _overlap_ratio(abstract_tokens, seed_abstract_tokens)
        venue_score = _overlap_ratio(venue_tokens, seed_venue_tokens)
        score = min(1.0, (title_score * 0.65) + (abstract_score * 0.25) + (venue_score * 0.10))
        scored.append({**paper, "similarity_score": score})

    scored.sort(key=lambda p: p["similarity_score"], reverse=True)
    return scored
