import { useLanguage } from "../../i18n";
import { getCardThemeGroup } from "./cardContent";
import TierBadge from "./TierBadge";

function formatImpactFactor(value) {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) return null;
  const fixed = value.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

function deriveSummary(paper) {
  if (paper?.card_content?.plain_summary) return paper.card_content.plain_summary;
  if (paper?.card_content?.key_insight) return paper.card_content.key_insight;
  if (paper?.card_content?.core_contribution) return paper.card_content.core_contribution;
  if (paper?.card_content?.key_findings) return paper.card_content.key_findings;
  return paper?.abstract || "";
}

function getTitleLines(paper, locale) {
  const title = String(paper?.title || "").trim();
  const titleZh = String(paper?.title_zh || "").trim();
  const hasBilingual = Boolean(title && titleZh && titleZh !== title);

  if (locale === "zh") {
    return {
      primary: titleZh || title,
      secondary: hasBilingual ? title : "",
    };
  }

  return {
    primary: title || titleZh,
    secondary: hasBilingual ? titleZh : "",
  };
}

export default function PaperDigestCard({
  paper,
  title,
  eyebrow,
  actionLabel,
  onAction,
  secondaryAction,
}) {
  const { t, locale } = useLanguage();
  const summary = deriveSummary(paper);
  const titleLines = getTitleLines(paper, locale);
  const themeGroup = getCardThemeGroup({ ...paper, mode: paper?.mode || "research" });
  const matchPct = paper?.similarity_score > 0 ? Math.round(paper.similarity_score * 100) : null;
  const impactFactor = formatImpactFactor(paper?.impact_factor);
  const citesLabel = locale === "en" ? "cites" : "引用";
  const briefLabel = locale === "en" ? "Brief" : "中文简报";

  return (
    <article className="digest-card">
      <div className="digest-card-top">
        <div className="space-y-2">
          {eyebrow && <p className="digest-card-eyebrow">{eyebrow}</p>}
          <h3 className="digest-card-title">{title || titleLines.primary}</h3>
          {titleLines.secondary && <p className="digest-card-title-secondary">{titleLines.secondary}</p>}
        </div>
        <div className="flex items-center gap-2">
          {matchPct !== null && <span className="digest-card-match">{matchPct}% {t("recommend.matchScore")}</span>}
          <TierBadge zone={paper?.zone} size="sm" isNi={paper?.is_ni} />
        </div>
      </div>

      <div className="digest-card-body">
        <p className="digest-card-meta">
          {paper?.authors?.slice(0, 3).join(", ")}
          {paper?.venue ? ` / ${paper.venue}` : ""}
          {paper?.year ? ` / ${paper.year}` : ""}
        </p>
        {summary && (
          <div className="space-y-2">
            <p className="digest-card-brief-label">{briefLabel}</p>
            <p className="digest-card-summary">{summary}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {themeGroup && <span className="digest-card-chip">{themeGroup}</span>}
          {paper?.doi && <span className="digest-card-chip">DOI</span>}
          {impactFactor && <span className="digest-card-chip">{`IF ${impactFactor}`}</span>}
          {paper?.is_ni && <span className="digest-card-chip">NI</span>}
          <span className="digest-card-chip">{paper?.citation_count || 0} {citesLabel}</span>
        </div>
      </div>

      <div className="digest-card-actions">
        <button onClick={onAction} className="app-accent-button rounded-xl px-4 py-2.5">
          {actionLabel}
        </button>
        {secondaryAction}
      </div>
    </article>
  );
}
