from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

import httpx

from backend.config import Settings

logger = logging.getLogger(__name__)

# ─── Text helpers ────────────────────────────────────────────────────────────────

SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?。！？])\s*")
WHITESPACE_RE = re.compile(r"\s+")
ACRONYM_RE = re.compile(r"\b[A-Z][A-Z0-9.+\-/]{2,}\b")
CJK_RE = re.compile(r"[\u4e00-\u9fff]")
_JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)\s*```")

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
    "API", "DOI", "URL", "JSON", "HTTP", "HTML", "PDF",
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
        "dataset", "datasets", "benchmark", "benchmarks", "cohort",
        "participants", "patients", "samples", "subjects", "records",
        "images", "videos", "corpus", "million", "thousand",
    )
    matches = _select_sentences(sentences, hints, limit=2)
    return _join_sentences(matches, limit=2, max_chars=180) if matches else "N/A"


def _extract_problem_statement(sentences: list[str]) -> str:
    hints = (
        "challenge", "problem", "gap", "limited", "lack",
        "unclear", "unknown", "difficult", "motivation", "need",
    )
    matches = _select_sentences(sentences, hints, limit=2)
    if matches:
        return _join_sentences(matches, limit=2, max_chars=220)
    if sentences:
        return _join_sentences(sentences[:1], limit=1, max_chars=180)
    return "The paper frames its motivation through the task setup and venue context."


def _extract_research_gap(sentences: list[str], problem_statement: str) -> str:
    hints = (
        "however", "limited", "limitations", "lack", "lacks", "gap",
        "unclear", "challenge", "challenging", "difficult", "yet",
        "still", "fails", "missing",
    )
    matches = _select_sentences(sentences, hints, limit=2)
    if matches:
        return _join_sentences(matches, limit=2, max_chars=220)
    return _truncate(problem_statement, 180) if problem_statement else "N/A"


def _extract_method_snapshot(sentences: list[str], tech_stack: list[str], title: str) -> str:
    hints = (
        "we propose", "we present", "approach", "method", "framework",
        "model", "pipeline", "architecture", "train", "training",
        "evaluate", "evaluation", "benchmark",
    )
    matches = _select_sentences(sentences, hints, limit=2)
    if matches:
        return _join_sentences(matches, limit=2, max_chars=240)
    if tech_stack:
        return _truncate(
            f"The paper centers its approach on {', '.join(tech_stack[:3])} to address {title}.",
            210,
        )
    return "N/A"


def _extract_key_results(sentences: list[str]) -> str:
    hints = (
        "result", "results", "achieve", "achieves", "achieved",
        "improve", "improves", "improved", "outperform", "outperforms",
        "show", "shows", "demonstrate", "demonstrates", "find", "finds",
        "found", "performance",
    )
    matches = _select_sentences(sentences, hints, limit=2)
    if matches:
        return _join_sentences(matches, limit=2, max_chars=260)
    fallback = sentences[1:3] if len(sentences) > 1 else sentences[:1]
    if fallback:
        return _join_sentences(fallback, limit=2, max_chars=220)
    return "See the original paper for detailed results."


def _extract_data_and_evaluation(sentences: list[str], dataset_scale: str, key_results: str) -> str:
    hints = (
        "dataset", "benchmark", "benchmarks", "cohort", "evaluation",
        "evaluated", "experiment", "experiments", "samples", "subjects",
        "participants", "records", "images", "videos",
    )
    matches = _select_sentences(sentences, hints, limit=2)
    if matches:
        return _join_sentences(matches, limit=2, max_chars=220)
    if dataset_scale and dataset_scale != "N/A":
        return _truncate(dataset_scale, 180)
    if key_results:
        return _truncate(key_results, 180)
    return "N/A"


def _extract_novelty(title: str, sentences: list[str], tech_stack: list[str]) -> str:
    hints = (
        "propose", "proposes", "proposed", "present", "presents",
        "introduce", "introduces", "first", "novel", "new",
        "framework", "method", "approach", "benchmark", "dataset",
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


def _extract_next_step(sentences: list[str], limitations: str) -> str:
    hints = (
        "future work", "future", "next", "further", "could", "can be extended",
        "extend", "extension", "remain", "open question", "open questions",
    )
    matches = _select_sentences(sentences, hints, limit=2)
    if matches:
        return _join_sentences(matches, limit=2, max_chars=180)
    if limitations and limitations != "N/A":
        return _truncate(f"A natural next step is to address: {limitations}", 180)
    return "N/A"


def _extract_evidence_signals(
    venue: str,
    year: Any,
    citation_count: Any,
    tech_stack: list[str],
    dataset_scale: str,
) -> list[str]:
    signals: list[str] = []
    if venue and year:
        signals.append(f"{venue} {year}")
    elif venue:
        signals.append(venue)
    elif year:
        signals.append(str(year))
    if isinstance(citation_count, int) and citation_count > 0:
        signals.append(f"{citation_count} citations")
    if dataset_scale and dataset_scale != "N/A":
        signals.append(_truncate(dataset_scale, 72))
    if tech_stack:
        signals.append(", ".join(tech_stack[:2]))
    return _dedupe(signals)[:4]


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


def _coerce_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if str(item).strip()]


def _build_research_content(
    *,
    research_question: str,
    research_gap: str,
    method_snapshot: str,
    data_and_evaluation: str,
    key_findings: str,
    innovation: str,
    limitations: str,
    next_step: str,
    tech_stack: list[str],
    evidence_signals: list[str],
    core_contribution: str | None = None,
) -> dict[str, Any]:
    normalized_core = core_contribution or key_findings or method_snapshot or research_question
    normalized_methods = method_snapshot or "N/A"
    normalized_dataset = data_and_evaluation or "N/A"
    normalized_results = key_findings or normalized_core
    normalized_innovation = innovation or normalized_core
    normalized_limitations = limitations or "N/A"
    return {
        "research_question": research_question or normalized_core,
        "research_gap": research_gap or normalized_core,
        "method_snapshot": normalized_methods,
        "data_and_evaluation": normalized_dataset,
        "key_findings": normalized_results,
        "innovation": normalized_innovation,
        "limitations": normalized_limitations,
        "next_step": next_step or normalized_limitations,
        "tech_stack": _dedupe(tech_stack),
        "evidence_signals": _dedupe(evidence_signals),
        "core_contribution": normalized_core,
        "problem_statement": research_question or research_gap,
        "methods": normalized_methods,
        "dataset_scale": normalized_dataset,
        "key_results": normalized_results,
        "novelty": normalized_innovation,
    }


def _build_discovery_content(
    *,
    headline: str,
    plain_summary: str,
    key_insight: str,
    why_it_matters: str,
    who_should_read: str,
    simplified_tags: list[str],
    read_if: str = "",
    quick_takeaways: list[str] | None = None,
) -> dict[str, Any]:
    normalized_takeaways = _dedupe(quick_takeaways or [key_insight, why_it_matters])[:3]
    return {
        "headline": headline,
        "plain_summary": plain_summary,
        "key_insight": key_insight,
        "why_it_matters": why_it_matters,
        "who_should_read": who_should_read,
        "read_if": read_if or who_should_read,
        "quick_takeaways": normalized_takeaways,
        "simplified_tags": _dedupe(simplified_tags),
    }


# ─── AI helpers ──────────────────────────────────────────────────────────────────

def _build_ai_prompt(title: str, abstract: str, mode: str, language: str) -> str:
    is_zh = language.startswith("zh")
    no_abstract = "（无摘要）" if is_zh else "(no abstract)"
    text_abstract = abstract or no_abstract

    if mode == "research":
        if is_zh:
            return (
                f"你是学术论文分析助手。根据以下论文，生成研究卡内容，仅输出 JSON，不要有其他内容。\n\n"
                f"标题：{title}\n摘要：{text_abstract}\n\n"
                '输出格式：\n{\n'
                '  "research_question": "研究问题，1-2句",\n'
                '  "research_gap": "研究空白或现有方法不足，1-2句",\n'
                '  "method_snapshot": "方法路线与核心机制，2-3句",\n'
                '  "data_and_evaluation": "数据、实验设置与评估方式，1-2句，无则 N/A",\n'
                '  "key_findings": "关键结果与指标，2-3句",\n'
                '  "innovation": "创新点，2句左右",\n'
                '  "limitations": "局限性，1-2句，无则 N/A",\n'
                '  "next_step": "下一步研究方向，1句，无则 N/A",\n'
                '  "tech_stack": ["标签1", "标签2"],\n'
                '  "evidence_signals": ["证据1", "证据2"],\n'
                '  "core_contribution": "核心贡献，2-3句"\n}'
            )
        return (
            f"You are an academic paper analysis assistant. Generate research card content. Output JSON only.\n\n"
            f"Title: {title}\nAbstract: {text_abstract}\n\n"
            'Output format:\n{\n'
            '  "research_question": "Research question, 1-2 sentences",\n'
            '  "research_gap": "Research gap or weakness in prior work, 1-2 sentences",\n'
            '  "method_snapshot": "Methods and technical approach, 2-3 sentences",\n'
            '  "data_and_evaluation": "Data, experiments, and evaluation setup, 1-2 sentences, or N/A",\n'
            '  "key_findings": "Key findings and metrics, 2-3 sentences",\n'
            '  "innovation": "Innovation vs prior work, about 2 sentences",\n'
            '  "limitations": "Limitations, 1-2 sentences, or N/A",\n'
            '  "next_step": "Next research step, 1 sentence, or N/A",\n'
            '  "tech_stack": ["tag1", "tag2"],\n'
            '  "evidence_signals": ["signal1", "signal2"],\n'
            '  "core_contribution": "Core contribution, 2-3 sentences"\n}'
        )

    # discovery mode
    if is_zh:
        return (
            f"你是学术论文科普助手。根据以下论文，生成速览卡内容，仅输出 JSON，不要有其他内容。\n\n"
            f"标题：{title}\n摘要：{text_abstract}\n\n"
            '输出格式：\n{\n'
            '  "headline": "吸引眼球的一句话标题，15字以内",\n'
            '  "plain_summary": "通俗解释论文内容，2-3句",\n'
            '  "key_insight": "最重要的一个发现或洞见，1-2句",\n'
            '  "why_it_matters": "为什么值得关注，1-2句",\n'
            '  "who_should_read": "适合哪类读者，1句",\n'
            '  "read_if": "什么情况下应该读这篇，1句，可留空",\n'
            '  "quick_takeaways": ["亮点1", "亮点2"],\n'
            '  "simplified_tags": ["标签1", "标签2"]\n}'
        )
    return (
        f"You are an academic paper popularization assistant. Generate discovery card content. Output JSON only.\n\n"
        f"Title: {title}\nAbstract: {text_abstract}\n\n"
        'Output format:\n{\n'
        '  "headline": "Catchy one-liner, under 10 words",\n'
        '  "plain_summary": "Plain explanation of the paper, 2-3 sentences",\n'
        '  "key_insight": "The most important finding or insight, 1-2 sentences",\n'
        '  "why_it_matters": "Why it deserves attention, 1-2 sentences",\n'
        '  "who_should_read": "Who would benefit most from reading this, 1 sentence",\n'
        '  "read_if": "When someone should read this, 1 sentence, optional",\n'
        '  "quick_takeaways": ["takeaway1", "takeaway2"],\n'
        '  "simplified_tags": ["tag1", "tag2"]\n}'
    )


def _parse_ai_response(text: str, mode: str) -> dict[str, Any]:
    match = _JSON_BLOCK_RE.search(text)
    raw = match.group(1) if match else text.strip()
    data = json.loads(raw)

    if mode == "research":
        research_question = str(data.get("research_question", data.get("problem_statement", "")))
        research_gap = str(data.get("research_gap", data.get("problem_statement", "")))
        method_snapshot = str(data.get("method_snapshot", data.get("methods", "")))
        data_and_evaluation = str(data.get("data_and_evaluation", data.get("dataset_scale", "N/A")))
        key_findings = str(data.get("key_findings", data.get("key_results", "")))
        innovation = str(data.get("innovation", data.get("novelty", "")))
        limitations = str(data.get("limitations", "N/A"))
        next_step = str(data.get("next_step", limitations))
        tech_stack = _coerce_string_list(data.get("tech_stack", []))
        evidence_signals = _coerce_string_list(data.get("evidence_signals", []))
        core_contribution = str(data.get("core_contribution", key_findings or method_snapshot or research_question))
        return _build_research_content(
            research_question=research_question,
            research_gap=research_gap,
            method_snapshot=method_snapshot,
            data_and_evaluation=data_and_evaluation,
            key_findings=key_findings,
            innovation=innovation,
            limitations=limitations,
            next_step=next_step,
            tech_stack=tech_stack,
            evidence_signals=evidence_signals,
            core_contribution=core_contribution,
        )
    return _build_discovery_content(
        headline=str(data.get("headline", "")),
        plain_summary=str(data.get("plain_summary", "")),
        key_insight=str(data.get("key_insight", "")),
        why_it_matters=str(data.get("why_it_matters", "")),
        who_should_read=str(data.get("who_should_read", "")),
        simplified_tags=_coerce_string_list(data.get("simplified_tags", [])),
        read_if=str(data.get("read_if", "")),
        quick_takeaways=_coerce_string_list(data.get("quick_takeaways", [])),
    )


# ─── AI client ───────────────────────────────────────────────────────────────────

class _AiClient:
    def __init__(self, settings: Settings) -> None:
        from openai import AsyncOpenAI
        self._client = AsyncOpenAI(
            api_key=settings.qnaigc_api_key,
            base_url=settings.qnaigc_base_url,
        )
        self._model = settings.qnaigc_model

    async def close(self) -> None:
        await self._client.close()

    async def generate(self, paper: dict[str, Any], mode: str, language: str) -> dict[str, Any]:
        title = _clean_text(paper.get("title") or "")
        abstract = _clean_text(paper.get("abstract") or "")
        prompt = _build_ai_prompt(title, abstract, mode, language)
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1200,
        )
        return _parse_ai_response(response.choices[0].message.content or "", mode)


class _UserAiClient:
    """Per-request AI client built from user-supplied provider config.
    The key is held in memory only during the request and never logged.
    """

    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        from openai import AsyncOpenAI
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._model = model

    async def close(self) -> None:
        await self._client.close()

    async def generate(self, paper: dict[str, Any], mode: str, language: str) -> dict[str, Any]:
        title = _clean_text(paper.get("title") or "")
        abstract = _clean_text(paper.get("abstract") or "")
        prompt = _build_ai_prompt(title, abstract, mode, language)
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1200,
        )
        return _parse_ai_response(response.choices[0].message.content or "", mode)


# ─── Translation client ───────────────────────────────────────────────────────────

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


# ─── Card generator ───────────────────────────────────────────────────────────────

class CardGenerator:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.translator = TranslationClient(settings)
        self._ai: _AiClient | None = None
        if settings.qnaigc_api_key:
            try:
                self._ai = _AiClient(settings)
                logger.info("AI card generation enabled (model: %s)", settings.qnaigc_model)
            except Exception as exc:
                logger.warning("AI card generation unavailable: %s", exc)

    async def close(self) -> None:
        await self.translator.close()
        if self._ai is not None:
            await self._ai.close()

    async def localize_title(self, title: str, language: str = "zh") -> str:
        cleaned = _clean_text(title)
        if not cleaned:
            return cleaned
        return await self.translator.translate_text(cleaned, language)

    async def generate_card(
        self,
        paper: dict[str, Any],
        mode: str = "research",
        language: str = "en",
        ai_provider: Any | None = None,
    ) -> dict[str, Any]:
        # Use user-provided AI provider if available
        if ai_provider is not None:
            user_client = _UserAiClient(
                base_url=ai_provider.base_url,
                api_key=ai_provider.api_key,
                model=ai_provider.model,
            )
            try:
                return await user_client.generate(paper, mode, language)
            except Exception as exc:
                logger.warning("User AI provider failed, falling back: %s", exc)
            finally:
                await user_client.close()

        # Fall back to server-configured AI
        if self._ai is not None:
            try:
                return await self._ai.generate(paper, mode, language)
            except Exception as exc:
                logger.warning("AI card generation failed, using rule-based fallback: %s", exc)
        return await self._rule_based_generate(paper, mode, language)

    async def _rule_based_generate(self, paper: dict[str, Any], mode: str, language: str) -> dict[str, Any]:
        title = _clean_text(paper.get("title") or "Untitled")
        abstract = _clean_text(paper.get("abstract") or "")
        venue = _clean_text(paper.get("venue") or "Unknown venue")
        year = paper.get("year") or "Unknown year"
        citation_count = paper.get("citationCount", paper.get("citation_count", 0)) or 0

        sentences = _split_sentences(abstract)
        tech_stack = _extract_tech_stack(title, abstract)
        problem_statement = _extract_problem_statement(sentences)
        research_gap = _extract_research_gap(sentences, problem_statement)
        method_snapshot = _extract_method_snapshot(sentences, tech_stack, title)
        dataset_scale = _extract_dataset_scale(sentences)
        key_results = _extract_key_results(sentences)
        data_and_evaluation = _extract_data_and_evaluation(sentences, dataset_scale, key_results)
        novelty = _extract_novelty(title, sentences, tech_stack)
        next_step = _extract_next_step(sentences, "N/A")
        evidence_signals = _extract_evidence_signals(venue, year, citation_count, tech_stack, dataset_scale)

        if mode == "research":
            content = _build_research_content(
                research_question=problem_statement,
                research_gap=research_gap,
                method_snapshot=method_snapshot,
                data_and_evaluation=data_and_evaluation,
                key_findings=key_results,
                innovation=novelty,
                limitations="N/A",
                next_step=next_step,
                tech_stack=tech_stack,
                evidence_signals=evidence_signals,
                core_contribution=_extract_core_contribution(title, sentences, key_results),
            )
        else:
            content = _build_discovery_content(
                headline=_build_headline(title),
                plain_summary=_build_plain_summary(title, sentences),
                key_insight=_build_key_insight(title, sentences, key_results, novelty),
                why_it_matters=_build_why_it_matters(venue, year, citation_count, tech_stack),
                who_should_read="",
                simplified_tags=_derive_discovery_tags(tech_stack, title, abstract),
                quick_takeaways=[key_results, novelty],
            )

        return await self._localize_card(content, mode, language)

    async def _localize_card(self, content: dict[str, Any], mode: str, language: str) -> dict[str, Any]:
        if not language.startswith("zh"):
            return content

        if mode == "research":
            translated = await self.translator.translate_many(
                [
                    content.get("research_question", ""),
                    content.get("research_gap", ""),
                    content.get("method_snapshot", ""),
                    content.get("data_and_evaluation", ""),
                    content.get("key_findings", ""),
                    content.get("innovation", ""),
                    content.get("limitations", ""),
                    content.get("next_step", ""),
                    content.get("core_contribution", ""),
                ],
                language,
            )
            return _build_research_content(
                research_question=translated[0],
                research_gap=translated[1],
                method_snapshot=translated[2],
                data_and_evaluation=translated[3],
                key_findings=translated[4],
                innovation=translated[5],
                limitations=translated[6],
                next_step=translated[7],
                tech_stack=[TECH_TRANSLATIONS.get(item, item) for item in content.get("tech_stack", [])],
                evidence_signals=await self.translator.translate_many(content.get("evidence_signals", []), language),
                core_contribution=translated[8],
            )

        translated = await self.translator.translate_many(
            [
                content.get("headline", ""),
                content.get("plain_summary", ""),
                content.get("key_insight", ""),
                content.get("why_it_matters", ""),
                content.get("who_should_read", ""),
                content.get("read_if", ""),
            ],
            language,
        )
        return _build_discovery_content(
            headline=translated[0],
            plain_summary=translated[1],
            key_insight=translated[2],
            why_it_matters=translated[3],
            who_should_read=translated[4],
            read_if=translated[5],
            quick_takeaways=await self.translator.translate_many(content.get("quick_takeaways", []), language),
            simplified_tags=[TAG_TRANSLATIONS.get(item, item) for item in content.get("simplified_tags", [])],
        )
