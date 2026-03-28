from __future__ import annotations

TOP_VENUES = {
    "nature", "science", "cell", "the lancet", "new england journal of medicine",
    "neurips", "nips", "icml", "iclr", "cvpr", "iccv", "eccv", "aaai",
    "acl", "emnlp", "naacl", "sigir", "kdd", "www", "icse", "fse",
    "osdi", "sosp", "sigmod", "vldb", "stoc", "focs", "siggraph",
    "chi", "uist", "jama", "bmj", "pnas",
    "nature medicine", "nature methods", "nature biotechnology",
    "nature communications", "science advances",
}

GOOD_VENUES = {
    "plos one", "scientific reports", "frontiers", "ieee access",
    "arxiv", "biorxiv", "medrxiv",
    "coling", "wacv", "miccai", "isca", "interspeech",
    "ieee transactions", "acm transactions",
}


def classify_tier(
    citation_count: int,
    venue: str | None = None,
    year: int | None = None,
) -> str:
    venue_lower = (venue or "").lower().strip()

    # SSR: groundbreaking
    if citation_count > 500:
        return "SSR"
    if any(v in venue_lower for v in TOP_VENUES) and citation_count > 50:
        return "SSR"

    # SR: excellent
    if citation_count > 100:
        return "SR"
    if any(v in venue_lower for v in TOP_VENUES):
        return "SR"
    if any(v in venue_lower for v in GOOD_VENUES) and citation_count > 30:
        return "SR"

    # R: has contribution
    if citation_count > 20:
        return "R"
    if any(v in venue_lower for v in GOOD_VENUES):
        return "R"

    # N: normal
    return "N"
