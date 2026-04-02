import { useLanguage } from "../../i18n";
import {
  getCardSynopsis,
  normalizeDiscoveryContent,
  normalizeResearchContent,
} from "./cardContent";
import TierBadge, { getTierConfig } from "./TierBadge";

function DoiLink({ doi, url, theme }) {
  const href = doi ? `https://doi.org/${doi}` : url;
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`type-button flex items-center gap-1 rounded-md px-2 py-1 transition-colors ${theme.doiClass}`}
      title="Open paper"
      onClick={(event) => event.stopPropagation()}
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor">
        <path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z" />
        <path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z" />
      </svg>
      DOI
    </a>
  );
}

function FieldCaption({ children, theme }) {
  return <p className={`type-eyebrow ${theme.labelColor}`}>{children}</p>;
}

function SignalChips({ values, theme, prefix = "" }) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <span key={value} className={`type-button rounded-full px-2.5 py-1 ${theme.tagClass}`}>
          {prefix}
          {value}
        </span>
      ))}
    </div>
  );
}

function MetricBox({ label, value, theme }) {
  if (!value) return null;
  return (
    <div className="paper-card-module">
      <FieldCaption theme={theme}>{label}</FieldCaption>
      <p className={`mt-2 line-clamp-4 text-[11px] leading-5 ${theme.bodyColor}`}>{value}</p>
    </div>
  );
}

function MetaChip({ children, className = "" }) {
  return (
    <span className={`type-button inline-flex items-center rounded-full px-2.5 py-1 ${className}`}>
      {children}
    </span>
  );
}

function formatImpactFactor(value) {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) return null;
  const fixed = value.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

function ResearchSurface({ card, compact, theme, t, signalsLabel }) {
  const content = normalizeResearchContent(card.card_content);

  if (compact) {
    return (
      <div className="space-y-3">
        <p className={`line-clamp-4 text-[11px] leading-5 ${theme.bodyColor}`}>
          {getCardSynopsis(card, "research")}
        </p>
        <SignalChips values={content.techStack.slice(0, 2)} theme={theme} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="paper-card-lead">
        <FieldCaption theme={theme}>{t("card.coreContribution")}</FieldCaption>
        <p className={`mt-2 line-clamp-4 text-[12px] leading-6 ${theme.bodyColor}`}>
          {content.coreContribution || content.keyFindings || content.researchQuestion}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <MetricBox label={t("card.problemStatement")} value={content.researchQuestion || content.researchGap} theme={theme} />
        <MetricBox label={t("card.methods")} value={content.methodSnapshot} theme={theme} />
        <MetricBox label={t("card.keyResults")} value={content.keyFindings} theme={theme} />
        <MetricBox label={t("card.novelty")} value={content.innovation} theme={theme} />
      </div>
      {content.techStack.length > 0 && (
        <div className="space-y-2">
          <FieldCaption theme={theme}>{t("card.techStack")}</FieldCaption>
          <SignalChips values={content.techStack.slice(0, 4)} theme={theme} />
        </div>
      )}
      {content.evidenceSignals.length > 0 && (
        <div className="space-y-2">
          <FieldCaption theme={theme}>{signalsLabel}</FieldCaption>
          <SignalChips values={content.evidenceSignals.slice(0, 3)} theme={theme} />
        </div>
      )}
    </div>
  );
}

function DiscoverySurface({ card, compact, theme, t }) {
  const content = normalizeDiscoveryContent(card.card_content);

  if (compact) {
    return (
      <div className="space-y-3">
        {content.headline && <p className={`type-card-title line-clamp-2 ${theme.titleColor}`}>{content.headline}</p>}
        <p className={`line-clamp-4 text-[11px] leading-5 ${theme.bodyColor}`}>
          {getCardSynopsis(card, "discovery")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {content.headline && <p className={`type-section-title ${theme.titleColor}`}>{content.headline}</p>}
      <div className="paper-card-lead">
        <FieldCaption theme={theme}>{t("card.headline")}</FieldCaption>
        <p className={`mt-2 line-clamp-4 text-[12px] leading-6 ${theme.bodyColor}`}>
          {content.plainSummary || content.keyInsight}
        </p>
      </div>
      {content.quickTakeaways.length > 0 && <SignalChips values={content.quickTakeaways.slice(0, 3)} theme={theme} />}
      <MetricBox label={t("card.keyInsight")} value={content.keyInsight} theme={theme} />
      <MetricBox label={t("card.whyItMatters")} value={content.whyItMatters} theme={theme} />
      <MetricBox label={t("card.whoShouldRead")} value={content.readIf || content.whoShouldRead} theme={theme} />
      {content.simplifiedTags.length > 0 && <SignalChips values={content.simplifiedTags.slice(0, 4)} theme={theme} />}
    </div>
  );
}

function CardGeneratingState({ title, theme, t }) {
  return (
    <div className="flex flex-col items-center gap-4 px-5 py-8 text-center">
      <div className="relative h-16 w-16">
        <div className={`absolute inset-0 rounded-full border opacity-35 ${theme.loaderRingClass}`} />
        <div className={`absolute inset-2 animate-spin rounded-full border-2 border-t-transparent ${theme.loaderRingClass}`} />
        <div className={`absolute inset-[22px] animate-pulse rounded-full ${theme.loaderCoreClass}`} />
      </div>
      <div>
        <p className={`type-card-title ${theme.titleColor}`}>{t("card.generating")}</p>
        {title && <p className={`mt-1 text-xs ${theme.bodyColor}`}>{title}</p>}
      </div>
    </div>
  );
}

function getBilingualTitle(card) {
  const title = (card?.title || "").trim();
  const titleZh = (card?.title_zh || "").trim();
  const hasZh = /[\u4e00-\u9fff]/.test(titleZh);
  const sameText = title && titleZh && title.toLowerCase() === titleZh.toLowerCase();

  return {
    title,
    titleZh: hasZh && !sameText ? titleZh : "",
  };
}

export default function PaperCard({ card, mode = "research", compact = false, onClick }) {
  const { t, locale } = useLanguage();
  const theme = getTierConfig(card.zone || card.tier, { isNi: card.is_ni });
  const { title, titleZh } = getBilingualTitle(card);
  const isInteractive = Boolean(onClick);
  const signalsLabel = locale === "en" ? "Signals" : "\u8bc1\u636e\u4fe1\u53f7";
  const impactFactor = formatImpactFactor(card.impact_factor);

  return (
    <div
      onClick={onClick}
      className={`${theme.cardClass} paper-card-shell relative w-full overflow-hidden rounded-[30px] ${
        compact ? "aspect-[4/5]" : "aspect-[9/16]"
      } ${isInteractive ? "cursor-pointer hover:-translate-y-1 hover:brightness-110" : ""}`}
    >
      <div className="paper-card-overlay" />
      <div className="relative z-[1] flex h-full flex-col">
        <div className="shrink-0 px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <TierBadge zone={card.zone} tier={card.tier} isNi={card.is_ni} />
              {card.is_ni ? <MetaChip className="paper-card-ni-chip">NI</MetaChip> : null}
              {impactFactor ? <MetaChip className="paper-card-if-chip">{`IF ${impactFactor}`}</MetaChip> : null}
            </div>
            <div className="flex items-center gap-1">
              {card.similarity_score > 0 && (
                <span className={`type-button rounded-full border px-2 py-0.5 ${theme.matchClass}`}>
                  {Math.round(card.similarity_score * 100)}% {t("recommend.matchScore")}
                </span>
              )}
              <DoiLink doi={card.doi} url={card.url} theme={theme} />
            </div>
          </div>

          <div className="mt-3 space-y-1.5">
            <h3 className={`type-card-title leading-snug ${theme.titleColor} ${compact ? "line-clamp-2" : "line-clamp-3"}`}>
              {title}
            </h3>
            {titleZh && (
              <p className={`font-heading-cn leading-snug ${theme.titleSecondaryColor || theme.authorColor} ${compact ? "line-clamp-2 text-[11px]" : "line-clamp-2 text-[12px]"}`}>
                {titleZh}
              </p>
            )}
          </div>

          <p className={`mt-2 text-[11px] leading-relaxed ${theme.authorColor}`}>
            {card.authors?.slice(0, 2).join(", ")}
            {card.authors?.length > 2 ? ` +${card.authors.length - 2}` : ""}
            {card.venue ? ` / ${card.venue}` : ""}
            {card.year ? ` / ${card.year}` : ""}
          </p>
        </div>

        <div className={`mx-5 border-t ${theme.dividerClass}`} />

        {!card.card_content ? (
          <div className="min-h-0 flex-1">
            <CardGeneratingState title={card.title} theme={theme} t={t} />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
            {mode === "research" ? (
              <ResearchSurface card={card} compact={compact} theme={theme} t={t} signalsLabel={signalsLabel} />
            ) : (
              <DiscoverySurface card={card} compact={compact} theme={theme} t={t} />
            )}
          </div>
        )}

        <div className={`mx-5 mt-auto border-t ${theme.dividerClass}`} />
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-3">
          <div className="space-y-1">
            <p className={`type-eyebrow ${theme.labelColor}`}>
              {mode === "research" ? t("card.researchMode") : t("card.discoveryMode")}
            </p>
            <span className={`type-meta ${theme.citationClass}`}>
              {t("card.citations")}: {card.citation_count?.toLocaleString?.() ?? card.citation_count ?? 0}
            </span>
          </div>
          {isInteractive && (
            <span className={`type-button rounded-full px-2.5 py-1 ${theme.tagClass}`}>
              {t("recommend.viewCard")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
