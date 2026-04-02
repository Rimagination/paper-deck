import { useEffect, useMemo, useRef, useState } from "react";
import { getSubscriptionFeed, searchVenues } from "../../api/backend";
import { useScanSciAuth } from "../../auth";
import { useLanguage } from "../../i18n";
import PaperDigestCard from "../cards/PaperDigestCard";
import TierBadge from "../cards/TierBadge";

function VenueTag({ venue, onRemove }) {
  return (
    <span className="type-button inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-indigo-700">
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

function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/70 pb-4">
      <div>
        <h3 className="type-section-title text-slate-900">{title}</h3>
        <p className="type-body mt-1 text-slate-500">{subtitle}</p>
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
  const { t, locale } = useLanguage();
  const { getCollectedPaperIds } = useScanSciAuth();
  const [venueQuery, setVenueQuery] = useState("");
  const [venueResults, setVenueResults] = useState([]);
  const [isSearchingVenues, setIsSearchingVenues] = useState(false);
  const [feed, setFeed] = useState([]);
  const [isFetchingFeed, setIsFetchingFeed] = useState(false);
  const [daysBack, setDaysBack] = useState(30);
  const [minSimilarity, setMinSimilarity] = useState(0);
  const inputRef = useRef(null);
  const ui =
    locale === "en"
      ? {
          venueFallbackType: "Journal",
          venueWorksSummary: (count) => `${count.toLocaleString()} indexed papers available for tracking.`,
          venueFallbackSummary: "Track new papers from this source and route them into your inbox.",
          digestEyebrow: (index) => `Digest / ${index}`,
          structureNoteTitle: "Sources define supply",
          structureNoteBody: "Use this page to choose where papers come from. Prioritization and reading happen in Inbox.",
          followedLabel: "Followed sources",
          signalLabel: "Similarity filter",
        }
      : {
          venueFallbackType: "期刊",
          venueWorksSummary: (count) => `可跟踪 ${count.toLocaleString()} 篇已索引论文。`,
          venueFallbackSummary: "关注这个来源后，新论文会进入你的收件箱。",
          digestEyebrow: (index) => `Digest / ${index}`,
          structureNoteTitle: "信源决定供给",
          structureNoteBody: "这里负责决定文献从哪里来，优先级判断和阅读入口留在收件箱。",
          followedLabel: "已关注信源",
          signalLabel: "相似度过滤",
        };

  const hasProfile = profileReady && seedPaperIds.length > 0;
  const venueIdsKey = useMemo(() => subscribedVenues.map((venue) => venue.id).join("|"), [subscribedVenues]);
  const excludedPaperIds = useMemo(() => [...getCollectedPaperIds()], [getCollectedPaperIds]);

  useEffect(() => {
    if (subscribedVenues.length === 0) {
      setFeed([]);
      return;
    }
    loadSubscribedFeed();
  }, [venueIdsKey, daysBack, minSimilarity, profileInfo?.embedding?.length, excludedPaperIds.join("|")]);

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
        limit: 12,
        excludePaperIds: excludedPaperIds,
      });
      setFeed(papers);
    } catch (error) {
      console.error("Feed fetch failed:", error);
    }
    setIsFetchingFeed(false);
  }

  return (
    <div className="space-y-6">
      <section className="paper-surface rounded-[28px] p-6 sm:p-7">
        <div className="max-w-3xl">
          <h2 className="font-heading-cn type-page-title text-slate-950">
            {locale === "zh" ? "订阅" : "Subscriptions"}
          </h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">{t("sub.subtitle")}</p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="discover-metric-card">
            <span>{ui.followedLabel}</span>
            <span className="type-data">{subscribedVenues.length}</span>
          </div>
          <div className="discover-metric-card">
            <span>{t("sub.daysBack")}</span>
            <span className="type-data">{daysBack} {t("sub.days")}</span>
          </div>
          <div className="discover-metric-card">
            <span>{ui.signalLabel}</span>
            <span className="type-data">{hasProfile ? `${Math.round(minSimilarity * 100)}%+` : t("sub.matchAll")}</span>
          </div>
        </div>

        <div className="mt-5 rounded-[24px] border border-slate-200/80 bg-slate-50/70 px-5 py-4">
          <p className="type-eyebrow text-indigo-500">{ui.structureNoteTitle}</p>
          <p className="mt-2 text-sm leading-7 text-slate-600">{ui.structureNoteBody}</p>
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
            className="app-primary-button rounded-2xl px-5 py-3.5 disabled:opacity-40"
          >
            {isSearchingVenues ? t("seeds.searching") : t("seeds.search")}
          </button>
        </div>

        {venueResults.length > 0 && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {venueResults.map((venue) => {
              const already = subscribedVenues.some((item) => item.id === venue.id);
              return (
                <div key={venue.id} className="digest-card">
                  <div className="digest-card-top">
                    <div>
                      <p className="digest-card-eyebrow">{venue.type || ui.venueFallbackType}</p>
                      <h3 className="digest-card-title">{venue.name}</h3>
                    </div>
                    <TierBadge zone={venue.zone} size="sm" />
                  </div>
                  <div className="digest-card-body">
                    <p className="digest-card-summary">
                      {venue.works_count ? ui.venueWorksSummary(venue.works_count) : ui.venueFallbackSummary}
                    </p>
                  </div>
                  <div className="digest-card-actions">
                    <button
                      onClick={() => addVenue(venue)}
                      disabled={already}
                      className="app-accent-button rounded-xl px-4 py-2.5 disabled:opacity-40"
                    >
                      {already ? t("seeds.added") : t("sub.subscribe")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {subscribedVenues.length > 0 && (
          <div className="mt-5">
            <p className="type-eyebrow text-slate-400">
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

              {profileInfo?.embedding?.length > 0 && (
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
              )}

              <button
                onClick={loadSubscribedFeed}
                disabled={isFetchingFeed || subscribedVenues.length === 0}
                className="app-primary-button rounded-2xl px-4 py-2.5 disabled:opacity-40"
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
            <div className="grid gap-4 xl:grid-cols-2">
              {feed.map((paper, index) => (
                <PaperDigestCard
                  key={paper.paper_id}
                  paper={paper}
                  eyebrow={ui.digestEyebrow(index + 1)}
                  actionLabel={t("recommend.viewCard")}
                  onAction={() => onViewCard?.(paper)}
                  secondaryAction={paper.doi ? (
                    <a
                      href={`https://doi.org/${paper.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="app-outline-button rounded-xl px-4 py-2.5"
                    >
                      DOI
                    </a>
                  ) : null}
                />
              ))}
            </div>
          )}

          {!profileInfo?.embedding?.length && subscribedVenues.length > 0 && (
            <p className="mt-4 text-xs text-slate-400">{t("sub.noProfileHint")}</p>
          )}
        </div>
      </section>
    </div>
  );
}
