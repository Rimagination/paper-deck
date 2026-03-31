"""Journal ranking lookup service backed by JournalScout data."""
from __future__ import annotations

import json
import logging
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

ZONE_1 = "1\u533a"
ZONE_2 = "2\u533a"
ZONE_3 = "3\u533a"
ZONE_4 = "4\u533a"

_JCR_FALLBACK: dict[str, str] = {
    "Q1": ZONE_1,
    "Q2": ZONE_2,
    "Q3": ZONE_3,
    "Q4": ZONE_4,
}

_ZONE_TOKEN_RE = re.compile(r"([1-4])")


@dataclass(frozen=True)
class JournalRankMetadata:
    zone: str | None = None
    impact_factor: float | None = None
    is_ni: bool = False


def _normalize(text: str) -> str:
    """Lowercase, strip accents, collapse spaces."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", text).lower().strip()


def _coerce_if(value: object) -> float | None:
    if value in (None, "", 0):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return round(number, 1)


def _coerce_zone(value: object, jcr_quartile: object) -> str | None:
    raw = unicodedata.normalize("NFKC", str(value or "")).strip()
    if raw in {ZONE_1, ZONE_2, ZONE_3, ZONE_4}:
        return raw

    match = _ZONE_TOKEN_RE.search(raw)
    if match:
        return f"{match.group(1)}区"

    fallback = unicodedata.normalize("NFKC", str(jcr_quartile or "")).strip().upper()
    return _JCR_FALLBACK.get(fallback)


class JournalZoneService:
    """In-memory lookup for journal ranking metadata by ISSN or title."""

    def __init__(self) -> None:
        self._issn_map: dict[str, JournalRankMetadata] = {}
        self._title_map: dict[str, JournalRankMetadata] = {}
        self._loaded = False

    def load(self, index_path: str | Path) -> None:
        path = Path(index_path)
        if not path.exists():
            logger.warning("JournalZone: index not found at %s; ranking lookup disabled", path)
            return

        try:
            with open(path, encoding="utf-8") as handle:
                data = json.load(handle)

            journals: list[dict] = data.get("journals", [])
            for journal in journals:
                metadata = JournalRankMetadata(
                    zone=_coerce_zone(journal.get("cas_2025"), journal.get("jcr_quartile")),
                    impact_factor=_coerce_if(journal.get("if_2023")),
                    is_ni=bool(journal.get("ni_journal")),
                )
                if not any((metadata.zone, metadata.impact_factor, metadata.is_ni)):
                    continue

                for field in ("issn", "eissn"):
                    raw = str(journal.get(field) or "").strip()
                    if not raw:
                        continue
                    self._issn_map[raw] = metadata
                    self._issn_map[raw.replace("-", "")] = metadata

                title = str(journal.get("title") or "").strip()
                if title:
                    self._title_map[_normalize(title)] = metadata

            self._loaded = True
            logger.info(
                "JournalZone: loaded %d ISSN entries, %d title entries",
                len(self._issn_map),
                len(self._title_map),
            )
        except Exception as exc:
            logger.error("JournalZone: failed to load index: %s", exc)

    def lookup_metadata(
        self,
        *,
        issn: str | None = None,
        eissn: str | None = None,
        title: str | None = None,
        jcr_quartile: str | None = None,
    ) -> JournalRankMetadata:
        if self._loaded:
            for raw in (issn, eissn):
                if not raw:
                    continue
                normalized = raw.strip()
                if normalized in self._issn_map:
                    return self._issn_map[normalized]
                normalized = normalized.replace("-", "")
                if normalized in self._issn_map:
                    return self._issn_map[normalized]

            if title:
                key = _normalize(title)
                if key in self._title_map:
                    return self._title_map[key]

                prefix = key[:40]
                for candidate, metadata in self._title_map.items():
                    if candidate.startswith(prefix) or prefix.startswith(candidate[:40]):
                        return metadata

        fallback_zone = _JCR_FALLBACK.get((jcr_quartile or "").strip()) or None
        return JournalRankMetadata(zone=fallback_zone)

    def lookup(
        self,
        issn: str | None = None,
        eissn: str | None = None,
        title: str | None = None,
        jcr_quartile: str | None = None,
    ) -> str | None:
        return self.lookup_metadata(
            issn=issn,
            eissn=eissn,
            title=title,
            jcr_quartile=jcr_quartile,
        ).zone
