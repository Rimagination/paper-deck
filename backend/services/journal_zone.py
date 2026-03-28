"""Journal CAS zone lookup service backed by JournalScout data."""
from __future__ import annotations

import json
import logging
import re
import unicodedata
from pathlib import Path

logger = logging.getLogger(__name__)

# Zone constants
ZONE_1 = "1区"
ZONE_2 = "2区"
ZONE_3 = "3区"
ZONE_4 = "4区"

# Fallback: JCR quartile → zone when CAS data unavailable
_JCR_FALLBACK: dict[str, str] = {
    "Q1": ZONE_1,
    "Q2": ZONE_2,
    "Q3": ZONE_3,
    "Q4": ZONE_4,
}


def _normalize(text: str) -> str:
    """Lowercase, strip accents, collapse spaces."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", text).lower().strip()


class JournalZoneService:
    """In-memory lookup for CAS zone by ISSN or journal title."""

    def __init__(self) -> None:
        self._issn_map: dict[str, str] = {}   # issn → zone
        self._title_map: dict[str, str] = {}  # normalized_title → zone
        self._loaded = False

    def load(self, index_path: str | Path) -> None:
        path = Path(index_path)
        if not path.exists():
            logger.warning("JournalZone: index not found at %s — zone lookup disabled", path)
            return
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            journals: list[dict] = data.get("journals", [])
            for j in journals:
                zone = j.get("cas_2025") or ""
                if not zone:
                    continue
                # ISSN mapping
                for field in ("issn", "eissn"):
                    raw = (j.get(field) or "").strip()
                    if raw:
                        self._issn_map[raw] = zone
                        # Also store without hyphen
                        self._issn_map[raw.replace("-", "")] = zone
                # Title mapping
                title = (j.get("title") or "").strip()
                if title:
                    self._title_map[_normalize(title)] = zone
            self._loaded = True
            logger.info("JournalZone: loaded %d ISSN entries, %d title entries",
                        len(self._issn_map), len(self._title_map))
        except Exception as exc:
            logger.error("JournalZone: failed to load index: %s", exc)

    def lookup(
        self,
        issn: str | None = None,
        eissn: str | None = None,
        title: str | None = None,
        jcr_quartile: str | None = None,
    ) -> str | None:
        """Return CAS zone string or None. Falls back to JCR quartile if no CAS data."""
        if not self._loaded:
            return _JCR_FALLBACK.get(jcr_quartile or "") or None

        # Try ISSN first (most accurate)
        for raw in (issn, eissn):
            if raw:
                raw = raw.strip()
                if raw in self._issn_map:
                    return self._issn_map[raw]
                raw_clean = raw.replace("-", "")
                if raw_clean in self._issn_map:
                    return self._issn_map[raw_clean]

        # Try normalized title
        if title:
            key = _normalize(title)
            if key in self._title_map:
                return self._title_map[key]
            # Partial prefix match (first 40 chars) as fallback
            prefix = key[:40]
            for k, v in self._title_map.items():
                if k.startswith(prefix) or prefix.startswith(k[:40]):
                    return v

        # JCR quartile fallback
        return _JCR_FALLBACK.get(jcr_quartile or "") or None
