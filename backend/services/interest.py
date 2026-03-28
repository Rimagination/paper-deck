from __future__ import annotations

import math
from typing import Any


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
