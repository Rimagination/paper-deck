import { useLanguage } from "../../i18n";
import TierBadge, { getTierConfig } from "./TierBadge";

function DoiLink({ doi, url, theme }) {
  const href = doi ? `https://doi.org/${doi}` : url;
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${theme.doiClass}`}
      title="Open paper"
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor">
        <path d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z" />
        <path d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0v-5z" />
      </svg>
      DOI
    </a>
  );
}

function IdentifierText({ doi, paperId, theme }) {
  const label = doi ? "DOI" : "ID";
  const value = doi || paperId;
  if (!value) return null;

  return (
    <p className={`mt-2 text-[10px] leading-relaxed ${theme.authorColor}`}>
      <span className="font-semibold uppercase tracking-[0.18em]">{label}</span>
      <span className="ml-2 break-all">{value}</span>
    </p>
  );
}

function FieldLabel({ children, theme }) {
  return <p className={`text-[9px] font-bold uppercase tracking-widest ${theme.labelColor}`}>{children}</p>;
}

function ResearchContent({ content, t, theme }) {
  if (!content) return null;

  return (
    <div className="space-y-3.5">
      {content.core_contribution && (
        <div>
          <FieldLabel theme={theme}>{t("card.coreContribution")}</FieldLabel>
          <p className={`mt-1 text-xs leading-relaxed ${theme.bodyColor}`}>{content.core_contribution}</p>
        </div>
      )}
      {content.problem_statement && (
        <div>
          <FieldLabel theme={theme}>{t("card.problemStatement")}</FieldLabel>
          <p className={`mt-1 text-xs leading-relaxed ${theme.bodyColor}`}>{content.problem_statement}</p>
        </div>
      )}
      {content.tech_stack?.length > 0 && (
        <div>
          <FieldLabel theme={theme}>{t("card.techStack")}</FieldLabel>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {content.tech_stack.map((tag, index) => (
              <span key={index} className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${theme.tagClass}`}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
      {content.dataset_scale && content.dataset_scale !== "N/A" && (
        <div>
          <FieldLabel theme={theme}>{t("card.datasetScale")}</FieldLabel>
          <p className={`mt-1 text-xs ${theme.bodyColor}`}>{content.dataset_scale}</p>
        </div>
      )}
      {content.key_results && (
        <div>
          <FieldLabel theme={theme}>{t("card.keyResults")}</FieldLabel>
          <p className={`mt-1 text-xs leading-relaxed ${theme.bodyColor}`}>{content.key_results}</p>
        </div>
      )}
      {content.novelty && (
        <div>
          <FieldLabel theme={theme}>{t("card.novelty")}</FieldLabel>
          <p className={`mt-1 text-xs leading-relaxed ${theme.bodyColor}`}>{content.novelty}</p>
        </div>
      )}
    </div>
  );
}

function DiscoveryContent({ content, t, theme }) {
  if (!content) return null;

  return (
    <div className="space-y-3.5">
      {content.headline && <p className={`text-base font-bold leading-snug ${theme.titleColor}`}>"{content.headline}"</p>}
      {content.plain_summary && <p className={`text-sm leading-relaxed ${theme.bodyColor}`}>{content.plain_summary}</p>}
      {content.key_insight && (
        <div>
          <FieldLabel theme={theme}>{t("card.keyInsight")}</FieldLabel>
          <p className={`mt-1 rounded-lg px-3 py-2 text-xs leading-relaxed ${theme.insightClass}`}>
            {content.key_insight}
          </p>
        </div>
      )}
      {content.simplified_tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {content.simplified_tags.map((tag, index) => (
            <span key={index} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${theme.tagClass}`}>
              #{tag}
            </span>
          ))}
        </div>
      )}
      {content.why_it_matters && (
        <div>
          <FieldLabel theme={theme}>{t("card.whyItMatters")}</FieldLabel>
          <p className={`mt-1 text-xs leading-relaxed ${theme.bodyColor}`}>{content.why_it_matters}</p>
        </div>
      )}
    </div>
  );
}

function CitationGem({ count, theme }) {
  const display = count >= 1000 ? `${(count / 1000).toFixed(1)}K` : String(count);
  return (
    <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-full border-2 text-[11px] font-black ${theme.tagClass}`}>
      {display}
    </div>
  );
}

function CardGeneratingState({ title, theme, t }) {
  return (
    <div className="flex flex-col items-center gap-4 px-5 py-8 text-center">
      <div className="relative h-16 w-16">
        <div className={`absolute inset-0 rounded-full border opacity-35 ${theme.loaderRingClass}`} />
        <div className={`absolute inset-2 rounded-full border-2 border-t-transparent ${theme.loaderRingClass} animate-spin`} />
        <div className={`absolute inset-[22px] rounded-full ${theme.loaderCoreClass} animate-pulse`} />
      </div>
      <div>
        <p className={`text-sm font-semibold ${theme.titleColor}`}>{t("card.generating")}</p>
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
  const { t } = useLanguage();
  const theme = getTierConfig(card.zone || card.tier);
  const content = card.card_content;
  const { title, titleZh } = getBilingualTitle(card);

  return (
    <div
      onClick={onClick}
      className={`${theme.cardClass} relative aspect-[9/16] w-full overflow-hidden rounded-[28px] transition-all ${
        onClick ? "cursor-pointer hover:scale-[1.015] hover:brightness-110" : ""
      }`}
    >
      <div className="relative z-[1] flex h-full flex-col">
        <div className="shrink-0 px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-2">
            <TierBadge zone={card.zone} tier={card.tier} />
            <div className="flex items-center gap-1">
              {card.similarity_score > 0 && (
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${theme.matchClass}`}>
                  {Math.round(card.similarity_score * 100)}% {t("recommend.matchScore")}
                </span>
              )}
              <DoiLink doi={card.doi} url={card.url} theme={theme} />
            </div>
          </div>

          <div className="mt-3 space-y-1.5">
            <h3 className={`font-bold leading-snug ${theme.titleColor} ${compact ? "line-clamp-2 text-sm" : "line-clamp-3 text-[15px]"}`}>
              {title}
            </h3>
            {titleZh && (
              <p className={`font-heading-cn leading-snug ${theme.authorColor} ${compact ? "line-clamp-2 text-[11px]" : "line-clamp-3 text-[12px]"}`}>
                {titleZh}
              </p>
            )}
          </div>
          <p className={`mt-1.5 text-[11px] leading-relaxed ${theme.authorColor}`}>
            {card.authors?.slice(0, 2).join(", ")}
            {card.authors?.length > 2 ? ` +${card.authors.length - 2}` : ""}
            {card.venue ? ` / ${card.venue}` : ""}
            {card.year ? ` / ${card.year}` : ""}
          </p>
          <IdentifierText doi={card.doi} paperId={card.paper_id} theme={theme} />
        </div>

        <div className={`mx-5 border-t ${theme.dividerClass}`} />

        {compact && content && (
          <div className="min-h-0 flex-1 overflow-hidden px-5 pb-4 pt-3">
            <p className={`line-clamp-5 text-[11px] leading-relaxed ${theme.bodyColor}`}>
            {mode === "research" ? content.core_contribution : content.plain_summary || content.headline}
            </p>
          </div>
        )}

        {!compact && content && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {mode === "research" ? (
              <ResearchContent content={content} t={t} theme={theme} />
            ) : (
              <DiscoveryContent content={content} t={t} theme={theme} />
            )}
          </div>
        )}

        {!compact && !content && <CardGeneratingState title={card.title} theme={theme} t={t} />}

        <div className={`mx-5 mt-auto border-t ${theme.dividerClass}`} />
        <div className="flex shrink-0 items-center justify-between px-5 py-3">
          <span className={`text-[11px] ${theme.citationClass}`}>
            {t("card.citations")}: {card.citation_count?.toLocaleString?.() ?? card.citation_count ?? 0}
          </span>
          {!compact && <CitationGem count={card.citation_count || 0} theme={theme} />}
        </div>
      </div>
    </div>
  );
}
