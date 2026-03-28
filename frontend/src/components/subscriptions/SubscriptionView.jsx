import { useEffect, useMemo, useRef, useState } from "react";
import { getRecommendations, getSubscriptionFeed, searchVenues } from "../../api/backend";
import { useScanSciAuth } from "../../auth";
import { useLanguage } from "../../i18n";
import TierBadge from "../cards/TierBadge";

function VenueTag({ venue, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700">
      {venue.name}
      <TierBadge zone={venue.zone} size="sm" />
      <button
        onClick={() => onRemove(venue.id)}
        className="flex h-4 w-4 items-center justify-center rounded-full text-indigo-400 transition-colors hover:bg-white hover:text-rose-500"
        aria-label={`Remove ${venue.name}`}
      >
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M2 2l8 8M10 2L2 10" />
        </svg>
      </button>
    </span>
  );
}

function PaperRow({ paper, onViewCard, viewCardLabel, matchLabel }) {
  const matchPct = paper.similarity_score > 0 ? Math.round(paper.similarity_score * 100) : null;

  return (
    <div className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="line-clamp-2 text-sm font-semibold text-slate-900">{paper.title}</p>
          <TierBadge zone={paper.zone} size="sm" />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {paper.authors?.slice(0, 2).join(", ")}
          {paper.venue ? ` / ${paper.venue}` : ""}
          {paper.year ? ` / ${paper.year}` : ""}
          {paper.citation_count ? ` / ${paper.citation_count} cites` : ""}
        </p>
        {paper.abstract && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">{paper.abstract}</p>}
      </div>

      <div className="flex flex-none flex-col items-end gap-2">
        {matchPct !== null && (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-medium text-emerald-700">
            {matchPct}% {matchLabel}
          </span>
        )}
        <button
          onClick={() => onViewCard?.(paper)}
          className="rounded-lg bg-indigo-50 px-3 py-1.5 text-[11px] font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
        >
          {viewCardLabel}
        </button>
        {paper.doi && (
          <a
            href={`https://doi.org/${paper.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-slate-400 transition-colors hover:text-indigo-600"
          >
            DOI
          </a>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/70 pb-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ children }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/65 px-6 py-10 text-center text-sm text-slate-400">
      {children}
    </div>
  );
}

export default function SubscriptionView({
  profileInfo,
  profileReady,
  seedPaperIds,
  subscribedVenues,
  onSubscriptionsChange,
  onViewCard,
}) {
  const { t } = useLanguage();
  const { getCollectedPaperIds } = useScanSciAuth();
  const [venueQuery, setVenueQuery] = useState("");
  const [venueResults, setVenueResults] = useState([]);
  const [isSearchingVenues, setIsSearchingVenues] = useState(false);
  const [feed, setFeed] = useState([]);
  const [latestPicks, setLatestPicks] = useState([]);
  const [isFetchingFeed, setIsFetchingFeed] = useState(false);
  const [isFetchingPicks, setIsFetchingPicks] = useState(false);
  const [daysBack, setDaysBack] = useState(30);
  const [minSimilarity, setMinSimilarity] = useState(0);
  const inputRef = useRef(null);

  const hasProfile = profileReady && seedPaperIds.length > 0;
  const venueIdsKey = useMemo(
    () => subscribedVenues.map((venue) => venue.id).join("|"),
    [subscribedVenues]
  );
  const seedIdsKey = useMemo(() => seedPaperIds.join("|"), [seedPaperIds]);
  const excludedPaperIds = useMemo(() => [...getCollectedPaperIds()], [getCollectedPaperIds]);

  useEffect(() => {
    if (subscribedVenues.length === 0) {
      setFeed([]);
      return;
    }
    loadSubscribedFeed();
  }, [venueIdsKey, daysBack, minSimilarity, profileInfo?.embedding?.length, excludedPaperIds.join("|")]);

  useEffect(() => {
    if (!hasProfile) {
      setLatestPicks([]);
      return;
    }
    loadLatestPicks();
  }, [hasProfile, seedIdsKey, excludedPaperIds.join("|")]);

  async function handleVenueSearch() {
    const trimmed = venueQuery.trim();
    if (!trimmed || isSearchingVenues) return;

    setIsSearchingVenues(true);
    setVenueResults([]);
    try {
      const results = await searchVenues(trimmed);
      setVenueResults(results);
    } catch (error) {
      console.error("Venue search failed:", error);
    }
    setIsSearchingVenues(false);
  }

  function addVenue(venue) {
    if (subscribedVenues.some((item) => item.id === venue.id)) return;
    onSubscriptionsChange([...subscribedVenues, venue]);
    setVenueResults([]);
    setVenueQuery("");
    inputRef.current?.focus();
  }

  function removeVenue(id) {
    onSubscriptionsChange(subscribedVenues.filter((venue) => venue.id !== id));
  }

  async function loadSubscribedFeed() {
    if (subscribedVenues.length === 0 || isFetchingFeed) return;

    setIsFetchingFeed(true);
    try {
      const papers = await getSubscriptionFeed({
        venueIds: subscribedVenues.map((venue) => venue.id),
        interestEmbedding: profileReady ? profileInfo?.embedding || null : null,
        daysBack,
        minSimilarity,
        limit: 20,
        excludePaperIds: excludedPaperIds,
      });
      setFeed(papers);
    } catch (error) {
      console.error("Feed fetch failed:", error);
    }
    setIsFetchingFeed(false);
  }

  async function loadLatestPicks() {
    if (!hasProfile || isFetchingPicks) return;

    setIsFetchingPicks(true);
    try {
      const result = await getRecommendations(seedPaperIds, 24, null, excludedPaperIds);
      const picks = [...(result.papers || [])]
        .sort((left, right) => {
          const byYear = (right.year || 0) - (left.year || 0);
          if (byYear !== 0) return byYear;
          return (right.similarity_score || 0) - (left.similarity_score || 0);
        })
        .slice(0, 5);
      setLatestPicks(picks);
    } catch (error) {
      console.error("Latest picks fetch failed:", error);
      setLatestPicks([]);
    }
    setIsFetchingPicks(false);
  }

  return (
    <div className="space-y-6">
      <section className="paper-surface rounded-[28px] p-6 sm:p-7">
        <div className="max-w-3xl">
          <h2 className="font-heading text-2xl font-semibold text-slate-950">{t("sub.title")}</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">{t("sub.subtitle")}</p>
        </div>

        <div className="mt-6 flex flex-col gap-3 xl:flex-row">
          <input
            ref={inputRef}
            type="text"
            value={venueQuery}
            onChange={(event) => setVenueQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && handleVenueSearch()}
            placeholder={t("sub.searchPlaceholder")}
            className="app-input min-w-0 flex-1 rounded-2xl px-4 py-3.5 text-sm outline-none"
          />
          <button
            onClick={handleVenueSearch}
            disabled={!venueQuery.trim() || isSearchingVenues}
            className="app-primary-button rounded-2xl px-5 py-3.5 text-sm font-medium disabled:opacity-40"
          >
            {isSearchingVenues ? t("seeds.searching") : t("seeds.search")}
          </button>
        </div>

        {venueResults.length > 0 && (
          <div className="mt-4 space-y-2">
            {venueResults.map((venue) => {
              const already = subscribedVenues.some((item) => item.id === venue.id);
              return (
                <div
                  key={venue.id}
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/65 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900">{venue.name}</p>
                      <TierBadge zone={venue.zone} size="sm" />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {venue.type || "journal"}
                      {venue.works_count ? ` / ${venue.works_count.toLocaleString()} papers` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => addVenue(venue)}
                    disabled={already}
                  className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors disabled:opacity-40 ${
                      already
                        ? "cursor-default bg-emerald-50 text-emerald-600"
                        : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    }`}
                  >
                    {already ? t("seeds.added") : t("sub.subscribe")}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {subscribedVenues.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              {t("sub.subscribed")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {subscribedVenues.map((venue) => (
                <VenueTag key={venue.id} venue={venue} onRemove={removeVenue} />
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="paper-surface rounded-[28px] p-6 sm:p-7">
        <SectionHeader
          title={t("sub.subscribedFeedTitle")}
          subtitle={t("sub.subscribedFeedSubtitle")}
          action={
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-500">{t("sub.daysBack")}</label>
                <select
                  value={daysBack}
                  onChange={(event) => setDaysBack(Number(event.target.value))}
                  className="app-select rounded-xl px-3 py-2 text-sm outline-none"
                >
                  <option value={7}>7 {t("sub.days")}</option>
                  <option value={14}>14 {t("sub.days")}</option>
                  <option value={30}>30 {t("sub.days")}</option>
                  <option value={90}>90 {t("sub.days")}</option>
                </select>
              </div>

              {profileInfo?.embedding?.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-500">{t("sub.minMatch")}</label>
                  <select
                    value={minSimilarity}
                    onChange={(event) => setMinSimilarity(Number(event.target.value))}
                  className="app-select rounded-xl px-3 py-2 text-sm outline-none"
                  >
                    <option value={0}>{t("sub.matchAll")}</option>
                    <option value={0.1}>{">= 10%"}</option>
                    <option value={0.2}>{">= 20%"}</option>
                    <option value={0.3}>{">= 30%"}</option>
                  </select>
                </div>
              )}

              <button
                onClick={loadSubscribedFeed}
                disabled={isFetchingFeed || subscribedVenues.length === 0}
                className="app-primary-button rounded-2xl px-4 py-2.5 text-sm font-medium disabled:opacity-40"
              >
                {isFetchingFeed ? t("common.loading") : t("sub.fetchFeed")}
              </button>
            </div>
          }
        />

        <div className="mt-5">
          {subscribedVenues.length === 0 ? (
            <EmptyState>{t("sub.subscribedEmpty")}</EmptyState>
          ) : feed.length === 0 && !isFetchingFeed ? (
            <EmptyState>{t("sub.emptyFeed")}</EmptyState>
          ) : (
            <div className="space-y-3">
              {feed.map((paper) => (
                <PaperRow
                  key={paper.paper_id}
                  paper={paper}
                  onViewCard={onViewCard}
                  viewCardLabel={t("recommend.viewCard")}
                  matchLabel={t("recommend.matchScore")}
                />
              ))}
            </div>
          )}

          {!profileInfo?.embedding?.length && subscribedVenues.length > 0 && (
            <p className="mt-4 text-xs text-slate-400">{t("sub.noProfileHint")}</p>
          )}
        </div>
      </section>

      <section className="paper-surface rounded-[28px] p-6 sm:p-7">
        <SectionHeader
          title={t("sub.latestPicksTitle")}
          subtitle={t("sub.latestPicksSubtitle")}
          action={
            <button
              onClick={loadLatestPicks}
              disabled={!hasProfile || isFetchingPicks}
              className="app-outline-button rounded-2xl px-4 py-2.5 text-sm font-medium disabled:opacity-40"
            >
              {isFetchingPicks ? t("common.loading") : t("sub.refreshPicks")}
            </button>
          }
        />

        <div className="mt-5">
          {!hasProfile ? (
            <EmptyState>{t("sub.latestPicksEmpty")}</EmptyState>
          ) : latestPicks.length === 0 && !isFetchingPicks ? (
            <EmptyState>{t("sub.latestPicksEmpty")}</EmptyState>
          ) : (
            <div className="space-y-3">
              {latestPicks.map((paper) => (
                <PaperRow
                  key={paper.paper_id}
                  paper={paper}
                  onViewCard={onViewCard}
                  viewCardLabel={t("recommend.viewCard")}
                  matchLabel={t("recommend.matchScore")}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
