import { useLanguage } from "../../i18n";
import {
  buildDiscoveryReadingModel,
  isMeaningfulText,
  normalizeResearchContent,
} from "./cardContent";

function getSerifClass(value, locale) {
  if (locale === "zh" || /[\u3400-\u9fff]/.test(String(value || ""))) {
    return "font-heading-cn";
  }
  return "font-heading";
}

function SectionBlock({ label, value, accent = false, locale = "zh" }) {
  if (!isMeaningfulText(value)) return null;
  return (
    <section className="reading-section">
      <p className={`reading-section-label ${getSerifClass(label, locale)}`}>{label}</p>
      <div className={`reading-section-body ${accent ? "is-accent" : ""}`}>{value}</div>
    </section>
  );
}

function TagList({ values, prefix = "#" }) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <span key={value} className="reading-chip">
          {prefix}
          {value}
        </span>
      ))}
    </div>
  );
}

function ResearchReadingPanel({ card }) {
  const { locale } = useLanguage();
  const content = normalizeResearchContent(card?.card_content);
  const labels =
    locale === "zh"
      ? {
          question: "研究问题",
          gap: "研究空白",
          method: "方法路线",
          data: "数据与评估",
          findings: "关键结果",
          innovation: "创新点",
          limitations: "局限",
          next: "下一步",
          signals: "证据信号",
          stack: "技术栈",
        }
      : {
          question: "Research Question",
          gap: "Research Gap",
          method: "Method Snapshot",
          data: "Data & Evaluation",
          findings: "Key Findings",
          innovation: "Innovation",
          limitations: "Limitations",
          next: "Next Step",
          signals: "Evidence Signals",
          stack: "Tech Stack",
        };

  return (
    <div className="space-y-5">
      <SectionBlock label={labels.question} value={content.researchQuestion} accent locale={locale} />
      <SectionBlock label={labels.gap} value={content.researchGap} locale={locale} />
      <SectionBlock label={labels.method} value={content.methodSnapshot} locale={locale} />
      <SectionBlock label={labels.data} value={content.dataAndEvaluation} locale={locale} />
      <SectionBlock label={labels.findings} value={content.keyFindings} locale={locale} />
      <SectionBlock label={labels.innovation} value={content.innovation} locale={locale} />
      {content.evidenceSignals.length > 0 && (
        <section className="reading-section">
          <p className={`reading-section-label ${getSerifClass(labels.signals, locale)}`}>{labels.signals}</p>
          <TagList values={content.evidenceSignals} prefix="" />
        </section>
      )}
      {content.techStack.length > 0 && (
        <section className="reading-section">
          <p className={`reading-section-label ${getSerifClass(labels.stack, locale)}`}>{labels.stack}</p>
          <TagList values={content.techStack} prefix="" />
        </section>
      )}
      <SectionBlock label={labels.limitations} value={content.limitations} locale={locale} />
      <SectionBlock label={labels.next} value={content.nextStep} locale={locale} />
    </div>
  );
}

function DiscoveryReadingPanel({ card }) {
  const { locale } = useLanguage();
  const content = buildDiscoveryReadingModel(card);
  const labels =
    locale === "zh"
      ? {
          summary: "通俗解释",
          insight: "关键洞察",
          matters: "为什么值得看",
          methodCue: "方法线索",
          resultSignal: "结果信号",
          readIf: "什么情况下读",
          audience: "适合谁读",
          takeaways: "速览要点",
        }
      : {
          summary: "Plain Summary",
          insight: "Key Insight",
          matters: "Why It Matters",
          methodCue: "Method Cue",
          resultSignal: "Result Signal",
          readIf: "Read If",
          audience: "Who Should Read",
          takeaways: "Quick Takeaways",
        };

  return (
    <div className="space-y-5">
      {isMeaningfulText(content.headline) && (
        <p className={`reading-headline ${getSerifClass(content.headline, locale)}`}>{content.headline}</p>
      )}
      <SectionBlock label={labels.summary} value={content.summary} accent locale={locale} />
      <SectionBlock label={labels.insight} value={content.insight} locale={locale} />
      <SectionBlock label={labels.matters} value={content.whyItMatters} locale={locale} />
      <SectionBlock label={labels.methodCue} value={content.methodCue} locale={locale} />
      <SectionBlock label={labels.resultSignal} value={content.resultSignal} locale={locale} />
      <SectionBlock label={labels.readIf} value={content.readIf} locale={locale} />
      <SectionBlock label={labels.audience} value={content.audience} locale={locale} />
      {content.quickTakeaways.length > 0 && (
        <section className="reading-section">
          <p className={`reading-section-label ${getSerifClass(labels.takeaways, locale)}`}>{labels.takeaways}</p>
          <TagList values={content.quickTakeaways} prefix="" />
        </section>
      )}
      <TagList values={content.simplifiedTags} />
    </div>
  );
}

export default function ReadingPanel({ card, mode = "research" }) {
  if (!card?.card_content) return null;

  return (
    <div className="reading-panel">
      {mode === "research" ? <ResearchReadingPanel card={card} /> : <DiscoveryReadingPanel card={card} />}
    </div>
  );
}
