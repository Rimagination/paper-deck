import { useEffect, useState } from "react";
import { useLanguage } from "../../i18n";
import { gachaDraw, getRecommendations, getSubscriptionFeed } from "../../api/backend";
import TierBadge from "../cards/TierBadge";

function PaperListItem({ paper, t, onViewCard }) {
  function formatMatchScore(score) {
    if (!score || score <= 0) return null;
    return `${Math.round(score * 100)}% ${t("recommend.matchScore")}`;
  }

  return (
    <div className="group relative">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="type-card-title line-clamp-2 text-slate-900">{paper.title}</h3>
            <p className="mt-1 text-xs text-slate-500">
              {paper.authors?.slice(0, 2).join(", ")}
              {paper.venue ? ` / ${paper.venue}` : ""}
              {paper.year ? ` / ${paper.year}` : ""}
            </p>
          </div>
          <TierBadge zone={paper.zone} size="sm" />
        </div>

        {paper.abstract && <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-600">{paper.abstract}</p>}

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span>{paper.citation_count || 0} cites</span>
            {formatMatchScore(paper.similarity_score) && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                {formatMatchScore(paper.similarity_score)}
              </span>
            )}
          </div>
          <button
            onClick={() => onViewCard(paper)}
            className="type-button rounded-lg bg-indigo-50 px-3 py-1 text-indigo-700 transition-colors hover:bg-indigo-100"
          >
            {t("recommend.viewCard")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RecommendView({
  seedPaperIds,
  profileReady,
  interestProfile,
  subscribedVenues,
  cardMode,
  onStartGacha,
  onViewCard,
  onManageSubscriptions,
}) {
  const { t } = useLanguage();
  const [papers, setPapers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [drawCount, setDrawCount] = useState(5);
  const [isDrawing, setIsDrawing] = useState(false);
  const [yearMin, setYearMin] = useState("");

  const hasSubscriptions = subscribedVenues.length > 0;
  const venueIdsKey = subscribedVenues.map((venue) => venue.id).join("|");
  const seedIdsKey = seedPaperIds.join("|");
  const interestEmbedding = interestProfile?.embedding || null;

  useEffect(() => {
    if (hasSubscriptions) {
      loadSubscriptionRecommendations();
      return;
    }

    if (profileReady && seedPaperIds.length > 0) {
      loadRecommendations();
      return;
    }

    setPapers([]);
  }, [hasSubscriptions, interestProfile?.embedding?.length, profileReady, seedIdsKey, venueIdsKey]);

  async function loadRecommendations() {
    setIsLoading(true);
    try {
      const result = await getRecommendations(seedPaperIds, 20, yearMin ? parseInt(yearMin, 10) : null);
      setPapers(result.papers || []);
    } catch (error) {
      console.error("Recommendation failed:", error);
    }
    setIsLoading(false);
  }

  async function loadSubscriptionRecommendations() {
    if (!hasSubscriptions) return;

    setIsLoading(true);
    try {
      const result = await getSubscriptionFeed({
        venueIds: subscribedVenues.map((venue) => venue.id),
        interestEmbedding,
        daysBack: 30,
        minSimilarity: 0,
        limit: 5,
      });
      setPapers(result || []);
    } catch (error) {
      console.error("Subscription recommendation failed:", error);
    }
    setIsLoading(false);
  }

  async function handleDraw() {
    if (seedPaperIds.length === 0) return;

    setIsDrawing(true);
    try {
      const result = await gachaDraw(seedPaperIds, drawCount, cardMode);
      onStartGacha(result.cards || []);
    } catch (error) {
      console.error("Gacha draw failed:", error);
    }
    setIsDrawing(false);
  }

  function handleViewCard(paper) {
    const cacheKey = `${paper.paper_id}:${cardMode}`;
    if (generatedCards[cacheKey]) {
      onViewCard(generatedCards[cacheKey]);
      return;
    }
    // Open modal immediately — CardDetail handles generation + loading animation
    onViewCard(paper);
  }

  if (!profileReady && !hasSubscriptions) {
    return (
      <div className="paper-surface flex flex-col items-center justify-center gap-4 rounded-2xl py-20">
        <p className="text-sm text-slate-500">{t("recommend.empty")}</p>
        <button
          onClick={onManageSubscriptions}
          className="type-button rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-slate-700 hover:bg-slate-50"
        >
          {t("nav.subscriptions")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="paper-surface rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-heading-cn type-section-title text-slate-900">{t("recommend.title")}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {hasSubscriptions
                ? `${subscribedVenues.length} subscriptions active. New papers are prioritized from your journals.`
                : t("recommend.subtitle")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {hasSubscriptions ? (
              <>
                <button
                  onClick={onManageSubscriptions}
                  className="type-button rounded-lg border border-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-50"
                >
                  {t("nav.subscriptions")}
                </button>
                <button
                  onClick={loadSubscriptionRecommendations}
                  disabled={isLoading}
                  className="type-button rounded-lg bg-slate-900 px-4 py-2 text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {t("recommend.refresh")}
                </button>
              </>
            ) : (
              <>
                <input
                  type="number"
                  value={yearMin}
                  onChange={(event) => setYearMin(event.target.value)}
                  placeholder={t("recommend.yearFilter")}
                  className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300"
                />
                <button
                  onClick={loadRecommendations}
                  disabled={isLoading}
                  className="type-button rounded-lg border border-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {t("recommend.refresh")}
                </button>
              </>
            )}

            {seedPaperIds.length > 0 && (
              <div className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 pl-4 pr-1 shadow-md">
                <span className="type-button text-white">{t("recommend.drawCards")}</span>
                <select
                  value={drawCount}
                  onChange={(event) => setDrawCount(parseInt(event.target.value, 10))}
                  className="type-button bg-transparent py-2 text-white outline-none [&>option]:text-black"
                >
                  <option value={1}>1 {t("recommend.drawCount")}</option>
                  <option value={5}>5 {t("recommend.drawCount")}</option>
                  <option value={10}>10 {t("recommend.drawCount")}</option>
                </select>
                <button
                  onClick={handleDraw}
                  disabled={isDrawing}
                  className="type-button rounded-lg bg-white/20 px-3 py-1.5 text-white transition-colors hover:bg-white/30 disabled:opacity-50"
                >
                  {isDrawing ? "..." : "GO"}
                </button>
              </div>
            )}
          </div>
        </div>

        {hasSubscriptions && (
          <div className="mt-4 flex flex-wrap gap-2">
            {subscribedVenues.map((venue) => (
              <span
                key={venue.id}
                className="type-button inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700"
              >
                {venue.name}
                <TierBadge zone={venue.zone} size="sm" />
              </span>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-slate-500">{t("recommend.loading")}</p>
        </div>
      ) : papers.length === 0 ? (
        <div className="paper-surface flex flex-col items-center justify-center gap-4 rounded-2xl py-20">
          <p className="text-sm text-slate-500">
            {hasSubscriptions ? t("sub.emptyFeed") : t("recommend.empty")}
          </p>
          {hasSubscriptions && (
            <button
              onClick={loadSubscriptionRecommendations}
              className="type-button rounded-xl bg-slate-900 px-5 py-2.5 text-white hover:bg-slate-800"
            >
              {t("recommend.refresh")}
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {papers.map((paper) => (
            <PaperListItem key={paper.paper_id} paper={paper} t={t} onViewCard={handleViewCard} />
          ))}
        </div>
      )}
    </div>
  );
}
