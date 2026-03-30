import { useLanguage } from "../../i18n";
import { getCardThemeGroup } from "./cardContent";
import TierBadge from "./TierBadge";

function deriveSummary(paper) {
  if (paper?.card_content?.plain_summary) return paper.card_content.plain_summary;
  if (paper?.card_content?.core_contribution) return paper.card_content.core_contribution;
  if (paper?.card_content?.key_findings) return paper.card_content.key_findings;
  return paper?.abstract || "";
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
  const themeGroup = getCardThemeGroup({ ...paper, mode: paper?.mode || "research" });
  const matchPct = paper?.similarity_score > 0 ? Math.round(paper.similarity_score * 100) : null;
  const citesLabel = locale === "en" ? "cites" : "引用";

  return (
    <article className="digest-card">
      <div className="digest-card-top">
        <div className="space-y-2">
          {eyebrow && <p className="digest-card-eyebrow">{eyebrow}</p>}
          <h3 className="digest-card-title">{title || paper?.title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {matchPct !== null && <span className="digest-card-match">{matchPct}% {t("recommend.matchScore")}</span>}
          <TierBadge zone={paper?.zone} size="sm" />
        </div>
      </div>

      <div className="digest-card-body">
        <p className="digest-card-meta">
          {paper?.authors?.slice(0, 3).join(", ")}
          {paper?.venue ? ` / ${paper.venue}` : ""}
          {paper?.year ? ` / ${paper.year}` : ""}
        </p>
        {summary && <p className="digest-card-summary">{summary}</p>}
        <div className="flex flex-wrap gap-2">
          {themeGroup && <span className="digest-card-chip">{themeGroup}</span>}
          {paper?.doi && <span className="digest-card-chip">DOI</span>}
          <span className="digest-card-chip">{paper?.citation_count || 0} {citesLabel}</span>
        </div>
      </div>

      <div className="digest-card-actions">
        <button onClick={onAction} className="app-accent-button rounded-xl px-4 py-2.5 text-sm font-medium">
          {actionLabel}
        </button>
        {secondaryAction}
      </div>
    </article>
  );
}
