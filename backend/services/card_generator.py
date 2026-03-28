from __future__ import annotations

import asyncio
import re
from typing import Any

import httpx

from backend.config import Settings

SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?。！？])\s*")
WHITESPACE_RE = re.compile(r"\s+")
ACRONYM_RE = re.compile(r"\b[A-Z][A-Z0-9.+\-/]{2,}\b")
CJK_RE = re.compile(r"[\u4e00-\u9fff]")

TECH_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("Transformer", re.compile(r"\btransformer(s)?\b", re.IGNORECASE)),
    ("BERT", re.compile(r"\bbert\b", re.IGNORECASE)),
    ("GPT", re.compile(r"\bgpt(-\d+(\.\d+)?)?\b", re.IGNORECASE)),
    ("Large Language Model", re.compile(r"\blarge language model(s)?\b|\bllm(s)?\b", re.IGNORECASE)),
    ("Graph Neural Network", re.compile(r"\bgraph neural network(s)?\b|\bgnn(s)?\b", re.IGNORECASE)),
    ("Diffusion Model", re.compile(r"\bdiffusion model(s)?\b|\bdiffusion\b", re.IGNORECASE)),
    ("Reinforcement Learning", re.compile(r"\breinforcement learning\b|\brl\b", re.IGNORECASE)),
    ("Self-Attention", re.compile(r"\bself-attention\b", re.IGNORECASE)),
    ("Convolutional Network", re.compile(r"\bcnn(s)?\b|\bconvolutional neural network(s)?\b", re.IGNORECASE)),
    ("Recurrent Network", re.compile(r"\brnn(s)?\b|\blstm\b|\bgru\b", re.IGNORECASE)),
    ("Retrieval", re.compile(r"\bretrieval\b|\bretriever\b|\brag\b", re.IGNORECASE)),
    ("Knowledge Graph", re.compile(r"\bknowledge graph(s)?\b", re.IGNORECASE)),
    ("Benchmark", re.compile(r"\bbenchmark(s)?\b", re.IGNORECASE)),
    ("Survey", re.compile(r"\bsurvey\b|\breview\b", re.IGNORECASE)),
    ("Meta-analysis", re.compile(r"\bmeta-analysis\b|\bmeta analysis\b", re.IGNORECASE)),
    ("Clinical Trial", re.compile(r"\bclinical trial\b|\brandomized\b", re.IGNORECASE)),
    ("Simulation", re.compile(r"\bsimulation\b|\bsimulated\b", re.IGNORECASE)),
    ("Optimization", re.compile(r"\boptimization\b|\boptimisation\b", re.IGNORECASE)),
    ("Forecasting", re.compile(r"\bforecasting\b|\bprediction\b", re.IGNORECASE)),
    ("Dataset", re.compile(r"\bdataset(s)?\b|\bcorpus\b|\bcohort\b", re.IGNORECASE)),
]

TECH_TRANSLATIONS = {
    "Transformer": "Transformer",
    "BERT": "BERT",
    "GPT": "GPT",
    "Large Language Model": "大语言模型",
    "Graph Neural Network": "图神经网络",
    "Diffusion Model": "扩散模型",
    "Reinforcement Learning": "强化学习",
    "Self-Attention": "自注意力",
    "Convolutional Network": "卷积网络",
    "Recurrent Network": "循环网络",
    "Retrieval": "检索",
    "Knowledge Graph": "知识图谱",
    "Benchmark": "基准测试",
    "Survey": "综述",
    "Meta-analysis": "Meta 分析",
    "Clinical Trial": "临床试验",
    "Simulation": "仿真",
    "Optimization": "优化",
    "Forecasting": "预测",
    "Dataset": "数据集",
}

SUBJECT_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("Ecology", re.compile(r"\becology|ecosystem|species|trait\b", re.IGNORECASE)),
    ("Biomedical", re.compile(r"\bclinical|patient|disease|cancer|genome|biomedical\b", re.IGNORECASE)),
    ("NLP", re.compile(r"\blanguage|text|translation|summarization|nlp\b", re.IGNORECASE)),
    ("Computer Vision", re.compile(r"\bimage|vision|segmentation|detection|video\b", re.IGNORECASE)),
    ("Robotics", re.compile(r"\brobot|control|manipulation|navigation\b", re.IGNORECASE)),
    ("Recommendation", re.compile(r"\brecommend|ranking|retrieval\b", re.IGNORECASE)),
    ("Climate & Environment", re.compile(r"\bclimate|environment|precipitation|soil|forest\b", re.IGNORECASE)),
]

TAG_TRANSLATIONS = {
    **TECH_TRANSLATIONS,
    "Ecology": "生态学",
    "Biomedical": "生物医学",
    "NLP": "自然语言处理",
    "Computer Vision": "计算机视觉",
    "Robotics": "机器人",
    "Recommendation": "推荐系统",
    "Climate & Environment": "气候与环境",
}

COMMON_ACRONYM_STOPWORDS = {
    "API",
    "DOI",
    "URL",
    "JSON",
    "HTTP",
    "HTML",
    "PDF",
}


def _clean_text(value: str | None) -> str:
    return WHITESPACE_RE.sub(" ", (value or "").replace("\n", " ").replace("\r", " ")).strip()


def _split_sentences(text: str) -> list[str]:
    cleaned = _clean_text(text)
    if not cleaned:
        return []
    return [segment.strip(" ;,") for segment in SENTENCE_SPLIT_RE.split(cleaned) if segment.strip(" ;,")]


def _truncate(text: str, max_chars: int) -> str:
    cleaned = _clean_text(text)
    if len(cleaned) <= max_chars:
        return cleaned
    return cleaned[: max_chars - 3].rstrip(" ,;:") + "..."


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        key = value.lower()
        if not value or key in seen:
            continue
        seen.add(key)
        result.append(value)
    return result


def _select_sentences(sentences: list[str], keywords: tuple[str, ...], limit: int = 2) -> list[str]:
    matches = [
        sentence
        for sentence in sentences
        if any(keyword in sentence.lower() for keyword in keywords)
    ]
    return _dedupe(matches)[:limit]


def _join_sentences(sentences: list[str], limit: int = 2, max_chars: int = 280) -> str:
    excerpt = " ".join(_dedupe(sentences)[:limit]).strip()
    return _truncate(excerpt, max_chars)


def _extract_tech_stack(title: str, abstract: str) -> list[str]:
    text = f"{title} {abstract}"
    tags = [label for label, pattern in TECH_PATTERNS if pattern.search(text)]

    for token in ACRONYM_RE.findall(text):
        if token in COMMON_ACRONYM_STOPWORDS or token in tags:
            continue
        if len(token) <= 18:
            tags.append(token)

    return _dedupe(tags)[:8]


def _extract_dataset_scale(sentences: list[str]) -> str:
    hints = (
        "dataset",
        "datasets",
        "benchmark",
        "benchmarks",
        "cohort",
        "participants",
        "patients",
        "samples",
        "subjects",
        "records",
        "images",
        "videos",
        "corpus",
        "million",
        "thousand",
    )
    matches = _select_sentences(sentences, hints, limit=2)
    return _join_sentences(matches, limit=2, max_chars=180) if matches else "N/A"


def _extract_problem_statement(sentences: list[str]) -> str:
    hints = (
        "challenge",
        "problem",
        "gap",
        "limited",
        "lack",
        "unclear",
        "unknown",
        "difficult",
        "motivation",
        "need",
    )
    matches = _select_sentences(sentences, hints, limit=2)
    if matches:
        return _join_sentences(matches, limit=2, max_chars=220)
    if sentences:
        return _join_sentences(sentences[:1], limit=1, max_chars=180)
    return "The paper frames its motivation through the task setup and venue context."


def _extract_key_results(sentences: list[str]) -> str:
    hints = (
        "result",
        "results",
        "achieve",
        "achieves",
        "achieved",
        "improve",
        "improves",
        "improved",
        "outperform",
        "outperforms",
        "show",
        "shows",
        "demonstrate",
        "demonstrates",
        "find",
        "finds",
        "found",
        "performance",
    )
    matches = _select_sentences(sentences, hints, limit=2)
    if matches:
        return _join_sentences(matches, limit=2, max_chars=260)
    fallback = sentences[1:3] if len(sentences) > 1 else sentences[:1]
    if fallback:
        return _join_sentences(fallback, limit=2, max_chars=220)
    return "See the original paper for detailed results."


def _extract_novelty(title: str, sentences: list[str], tech_stack: list[str]) -> str:
    hints = (
        "propose",
        "proposes",
        "proposed",
        "present",
        "presents",
        "introduce",
        "introduces",
        "first",
        "novel",
        "new",
        "framework",
        "method",
        "approach",
        "benchmark",
        "dataset",
    )
    matches = _select_sentences(sentences, hints, limit=2)
    if matches:
        return _join_sentences(matches, limit=2, max_chars=220)

    if tech_stack:
        return _truncate(
            f"Frames the contribution around {', '.join(tech_stack[:3])} to approach the problem more directly.",
            180,
        )

    return _truncate(f"The paper introduces a distinct angle on {title}.", 180)


def _extract_core_contribution(title: str, sentences: list[str], key_results: str) -> str:
    if sentences:
        summary = _join_sentences(sentences[:2], limit=2, max_chars=240)
        if summary:
            return summary
    if key_results:
        return _truncate(key_results, 220)
    return _truncate(f"This paper studies {title}.", 160)


def _derive_discovery_tags(tech_stack: list[str], title: str, abstract: str) -> list[str]:
    tags = [item for item in tech_stack if item in TAG_TRANSLATIONS]
    text = f"{title} {abstract}"
    for label, pattern in SUBJECT_PATTERNS:
        if pattern.search(text):
            tags.append(label)
    return _dedupe(tags)[:5]


def _build_headline(title: str) -> str:
    return _truncate(title, 48) if title else "What does this paper contribute?"


def _build_plain_summary(title: str, sentences: list[str]) -> str:
    if sentences:
        excerpt = _join_sentences(sentences[:2], limit=2, max_chars=200)
        return _truncate(f'This paper studies "{_truncate(title, 42)}". The abstract points to: {excerpt}', 240)
    return _truncate(
        f'This paper studies "{_truncate(title, 42)}". No abstract is available, so it is better to verify the original paper directly.',
        180,
    )


def _build_key_insight(title: str, sentences: list[str], key_results: str, novelty: str) -> str:
    focus = key_results or novelty or (_join_sentences(sentences[:1], limit=1, max_chars=120) if sentences else "")
    if focus:
        return _truncate(f"Most notably, {focus}", 180)
    return _truncate(f'Most notably, the paper provides a clearer takeaway around "{_truncate(title, 36)}".', 160)


def _build_why_it_matters(venue: str, year: Any, citation_count: Any, tech_stack: list[str]) -> str:
    venue_text = venue or "this research area"
    year_text = str(year) if year else "recent years"
    citation_text = f" It currently has {citation_count} citations." if isinstance(citation_count, int) and citation_count > 0 else ""
    method_text = f" It also touches {', '.join(tech_stack[:2])}." if tech_stack else ""
    return _truncate(
        f"It appeared around {year_text} in {venue_text}, making it useful for quickly grasping the problem, method, and outcome.{citation_text}{method_text}",
        190,
    )


class TranslationClient:
    def __init__(self, settings: Settings) -> None:
        self._client = httpx.AsyncClient(
            base_url="https://translate.googleapis.com",
            timeout=8.0,
            headers={"User-Agent": settings.user_agent},
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def translate_text(self, text: str, target_language: str) -> str:
        cleaned = _clean_text(text)
        if not cleaned or not target_language.startswith("zh"):
            return cleaned
        if CJK_RE.search(cleaned):
            return cleaned

        try:
            response = await self._client.get(
                "/translate_a/single",
                params={
                    "client": "gtx",
                    "sl": "auto",
                    "tl": "zh-CN",
                    "dt": "t",
                    "q": cleaned,
                },
            )
            response.raise_for_status()
            data = response.json()
            segments = data[0] if isinstance(data, list) and data else []
            translated = "".join(
                segment[0]
                for segment in segments
                if isinstance(segment, list) and segment and isinstance(segment[0], str)
            ).strip()
            return translated or cleaned
        except Exception:
            return cleaned

    async def translate_many(self, values: list[str], target_language: str) -> list[str]:
        if not values:
            return []
        return list(await asyncio.gather(*(self.translate_text(value, target_language) for value in values)))


class CardGenerator:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.translator = TranslationClient(settings)

    async def close(self) -> None:
        await self.translator.close()

    async def _localize_card(self, content: dict[str, Any], mode: str, language: str) -> dict[str, Any]:
        if not language.startswith("zh"):
            return content

        if mode == "research":
            translated_fields = await self.translator.translate_many(
                [
                    content.get("core_contribution", ""),
                    content.get("problem_statement", ""),
                    content.get("dataset_scale", ""),
                    content.get("key_results", ""),
                    content.get("novelty", ""),
                ],
                language,
            )
            return {
                "core_contribution": translated_fields[0],
                "problem_statement": translated_fields[1],
                "tech_stack": [TECH_TRANSLATIONS.get(item, item) for item in content.get("tech_stack", [])],
                "dataset_scale": translated_fields[2],
                "key_results": translated_fields[3],
                "novelty": translated_fields[4],
            }

        translated_fields = await self.translator.translate_many(
            [
                content.get("headline", ""),
                content.get("plain_summary", ""),
                content.get("key_insight", ""),
                content.get("why_it_matters", ""),
            ],
            language,
        )
        return {
            "headline": translated_fields[0],
            "plain_summary": translated_fields[1],
            "key_insight": translated_fields[2],
            "why_it_matters": translated_fields[3],
            "simplified_tags": [TAG_TRANSLATIONS.get(item, item) for item in content.get("simplified_tags", [])],
        }

    async def generate_card(self, paper: dict[str, Any], mode: str = "research", language: str = "en") -> dict[str, Any]:
        title = _clean_text(paper.get("title") or "Untitled")
        abstract = _clean_text(paper.get("abstract") or "")
        venue = _clean_text(paper.get("venue") or "Unknown venue")
        year = paper.get("year") or "Unknown year"
        citation_count = paper.get("citationCount", paper.get("citation_count", 0)) or 0

        sentences = _split_sentences(abstract)
        tech_stack = _extract_tech_stack(title, abstract)
        dataset_scale = _extract_dataset_scale(sentences)
        key_results = _extract_key_results(sentences)
        novelty = _extract_novelty(title, sentences, tech_stack)

        if mode == "research":
            content = {
                "core_contribution": _extract_core_contribution(title, sentences, key_results),
                "problem_statement": _extract_problem_statement(sentences),
                "tech_stack": tech_stack,
                "dataset_scale": dataset_scale,
                "key_results": key_results,
                "novelty": novelty,
            }
        else:
            content = {
                "headline": _build_headline(title),
                "plain_summary": _build_plain_summary(title, sentences),
                "key_insight": _build_key_insight(title, sentences, key_results, novelty),
                "why_it_matters": _build_why_it_matters(venue, year, citation_count, tech_stack),
                "simplified_tags": _derive_discovery_tags(tech_stack, title, abstract),
            }

        return await self._localize_card(content, mode, language)
