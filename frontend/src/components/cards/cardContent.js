function firstFilled(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function cleanList(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  return values
    .map((value) => String(value || "").trim())
    .filter((value) => {
      if (!value) return false;
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function isMeaningfulText(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (!normalized) return false;
  return !["n/a", "not applicable", "不适用"].includes(normalized.toLowerCase());
}

export function normalizeResearchContent(content) {
  const next = content || {};
  const quickTakeaways = cleanList(next.quick_takeaways);
  const simplifiedTags = cleanList(next.simplified_tags);
  const discoveryHeadline = firstFilled(next.headline, next.plain_summary, next.key_insight);
  const discoveryInsight = firstFilled(next.key_insight, next.why_it_matters, next.plain_summary);
  const researchQuestion = firstFilled(
    next.research_question,
    next.problem_statement,
    next.core_contribution,
    discoveryHeadline,
    discoveryInsight,
  );
  const researchGap = firstFilled(next.research_gap, next.problem_statement, next.why_it_matters, discoveryInsight);
  const methodSnapshot = firstFilled(next.method_snapshot, next.methods, next.read_if, next.who_should_read);
  const dataAndEvaluation = firstFilled(next.data_and_evaluation, next.dataset_scale, quickTakeaways[0]);
  const keyFindings = firstFilled(
    next.key_findings,
    next.key_results,
    next.core_contribution,
    next.key_insight,
    next.plain_summary,
  );
  const innovation = firstFilled(next.innovation, next.novelty, next.key_insight, next.why_it_matters, next.core_contribution);
  const limitations = firstFilled(next.limitations);
  const nextStep = firstFilled(next.next_step);
  const techStack = cleanList(next.tech_stack).length > 0 ? cleanList(next.tech_stack) : simplifiedTags;
  const evidenceSignals =
    cleanList(next.evidence_signals).length > 0
      ? cleanList(next.evidence_signals)
      : [...quickTakeaways, ...simplifiedTags].slice(0, 4);

  return {
    researchQuestion,
    researchGap,
    methodSnapshot,
    dataAndEvaluation,
    keyFindings,
    innovation,
    limitations: isMeaningfulText(limitations) ? limitations : "",
    nextStep: isMeaningfulText(nextStep) ? nextStep : "",
    techStack,
    evidenceSignals,
    coreContribution: firstFilled(next.core_contribution, keyFindings, methodSnapshot),
    legacy: {
      problemStatement: firstFilled(next.problem_statement, researchQuestion),
      methods: firstFilled(next.methods, methodSnapshot),
      datasetScale: firstFilled(next.dataset_scale, dataAndEvaluation),
      keyResults: firstFilled(next.key_results, keyFindings),
      novelty: firstFilled(next.novelty, innovation),
    },
  };
}

export function normalizeDiscoveryContent(content) {
  const next = content || {};
  const research = normalizeResearchContent(next);
  const quickTakeaways = cleanList(next.quick_takeaways);
  const simplifiedTags = cleanList(next.simplified_tags);
  return {
    headline: firstFilled(next.headline, research.coreContribution, research.researchQuestion),
    plainSummary: firstFilled(next.plain_summary, research.coreContribution, research.keyFindings),
    keyInsight: firstFilled(next.key_insight, research.innovation, research.keyFindings, research.coreContribution),
    whyItMatters: firstFilled(next.why_it_matters, research.researchGap, research.innovation),
    whoShouldRead: firstFilled(next.who_should_read, next.read_if, research.methodSnapshot),
    readIf: firstFilled(next.read_if, next.who_should_read, research.methodSnapshot),
    quickTakeaways: quickTakeaways.length > 0 ? quickTakeaways : research.evidenceSignals.slice(0, 3),
    simplifiedTags: simplifiedTags.length > 0 ? simplifiedTags : research.techStack,
  };
}

export function buildDiscoveryReadingModel(card) {
  const discovery = normalizeDiscoveryContent(card?.card_content);
  const research = normalizeResearchContent(card?.card_content);
  const abstract = firstFilled(card?.abstract);

  return {
    headline: firstFilled(discovery.headline, research.coreContribution),
    summary: firstFilled(abstract, discovery.plainSummary, research.coreContribution, research.keyFindings),
    insight: firstFilled(discovery.keyInsight, research.innovation, research.keyFindings),
    whyItMatters: firstFilled(discovery.whyItMatters, research.researchGap, research.innovation),
    methodCue: firstFilled(research.methodSnapshot, discovery.readIf, discovery.whoShouldRead),
    resultSignal: firstFilled(research.keyFindings, discovery.quickTakeaways[0], discovery.keyInsight),
    readIf: firstFilled(discovery.readIf, discovery.whoShouldRead, research.researchQuestion),
    audience: firstFilled(discovery.whoShouldRead, discovery.readIf, research.methodSnapshot),
    quickTakeaways: discovery.quickTakeaways.length > 0 ? discovery.quickTakeaways : research.evidenceSignals.slice(0, 3),
    simplifiedTags: discovery.simplifiedTags.length > 0 ? discovery.simplifiedTags : research.techStack,
  };
}

export function getCardSynopsis(card, mode = "research") {
  if (!card?.card_content) return "";
  if (mode === "research") {
    const research = normalizeResearchContent(card.card_content);
    return (
      research.coreContribution ||
      research.researchQuestion ||
      research.keyFindings ||
      research.methodSnapshot
    );
  }
  const discovery = normalizeDiscoveryContent(card.card_content);
  return discovery.plainSummary || discovery.keyInsight || discovery.headline;
}

export function getCardThemeGroup(card) {
  if (!card?.card_content) return card?.venue || "General";
  if ((card.mode || "research") === "research") {
    const research = normalizeResearchContent(card.card_content);
    return research.techStack[0] || card?.venue || card?.zone || "General";
  }
  const discovery = normalizeDiscoveryContent(card.card_content);
  return discovery.simplifiedTags[0] || card?.venue || card?.zone || "General";
}

export function getReadingChecklist(content) {
  const research = normalizeResearchContent(content);
  return [
    { key: "question", value: research.researchQuestion },
    { key: "gap", value: research.researchGap },
    { key: "method", value: research.methodSnapshot },
    { key: "data", value: research.dataAndEvaluation },
    { key: "findings", value: research.keyFindings },
    { key: "innovation", value: research.innovation },
    { key: "limitations", value: research.limitations },
    { key: "next", value: research.nextStep },
  ].filter((item) => isMeaningfulText(item.value));
}
