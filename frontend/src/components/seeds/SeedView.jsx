import { useEffect, useMemo, useRef, useState } from "react";
import { useScanSciAuth } from "../../auth";
import { getRecommendations, getSubscriptionFeed, generateProfile, resolveSeedInput, searchSeeds } from "../../api/backend";
import { useLanguage } from "../../i18n";
import PaperDigestCard from "../cards/PaperDigestCard";
import { buildInterestMemory } from "./interestMemory";

const DOI_PATTERN = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;
const DOI_HOST_PATTERN = /(^|\/\/)(dx\.)?doi\.org\//i;
const S2_HOST_PATTERN = /(^|\/\/)(www\.)?semanticscholar\.org\//i;
const PAPER_ID_PATTERN = /^(CorpusID:\d+|[A-F0-9]{16,}|[A-Za-z0-9_-]{20,})$/i;

function getProfileSeedCount(profile) {
  if (!profile) return 0;
  if (Array.isArray(profile.seed_papers) && profile.seed_papers.length > 0) {
    return profile.seed_papers.length;
  }
  return profile.seed_count || 0;
}

function shouldResolveSeedInput(value) {
  const candidate = String(value || "").trim();
  if (!candidate) return false;

  return (
    DOI_PATTERN.test(candidate) ||
    /^doi:/i.test(candidate) ||
    DOI_HOST_PATTERN.test(candidate) ||
    S2_HOST_PATTERN.test(candidate) ||
    PAPER_ID_PATTERN.test(candidate)
  );
}

function formatSyncedAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function buildSearchRowMeta(paper, locale) {
  const parts = [];
  if (paper.venue) {
    parts.push(paper.venue);
  }
  if (paper.year) {
    parts.push(String(paper.year));
  }
  if (paper.citation_count) {
    parts.push(locale === "en" ? `${paper.citation_count} cites` : `${paper.citation_count} 引用`);
  }
  return parts.join(" / ");
}

function SectionFrame({ title, subtitle, action, children }) {
  return (
    <section className="paper-surface rounded-[28px] p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function SeedView({
  initialSeeds,
  initialProfile,
  subscribedVenues,
  cardMode,
  onProfileGenerated,
  onSeedsUpdated,
  onOpenDraw,
  onOpenSubscriptions,
  onViewCard,
}) {
  const { locale, t } = useLanguage();
  const {
    status: authStatus,
    startLogin,
    loadFavoriteItems,
    paperDeckProfileStatus,
    loadPaperDeckProfile,
    saveInterestProfile,
    getPaperDeckProfile,
    getCollectedPaperIds,
  } = useScanSciAuth();

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState("idle");
  const [searchError, setSearchError] = useState("");
  const [seeds, setSeeds] = useState(() => initialSeeds || []);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [profileInfo, setProfileInfo] = useState(() => initialProfile || null);
  const [showImport, setShowImport] = useState(false);
  const [importItems, setImportItems] = useState([]);
  const [importSelected, setImportSelected] = useState(new Set());
  const [savedProfile, setSavedProfile] = useState(null);
  const [isLoadingSavedProfile, setIsLoadingSavedProfile] = useState(false);
  const [savedProfileLoadError, setSavedProfileLoadError] = useState("");
  const [syncStatus, setSyncStatus] = useState("idle");
  const [digestPapers, setDigestPapers] = useState([]);
  const [subscribedDigest, setSubscribedDigest] = useState([]);
  const [isLoadingDigest, setIsLoadingDigest] = useState(false);
  const [isLoadingSubscribedDigest, setIsLoadingSubscribedDigest] = useState(false);
  const inputRef = useRef(null);
  const loadingGuardRef = useRef(null);
  const savedProfileLoadFailedText = locale === "en" ? "Saved profile could not be loaded right now." : "暂时无法加载已保存画像。";
  const retryText = locale === "en" ? "Retry" : "重试";
  const generateProfileFailedText = locale === "en" ? "Interest memory could not be generated right now." : "暂时无法生成兴趣记忆。";

  const memory = useMemo(() => buildInterestMemory(profileInfo), [profileInfo]);
  const excludedPaperIds = useMemo(() => [...getCollectedPaperIds()], [getCollectedPaperIds]);

  useEffect(() => {
    async function loadSavedProfile() {
      if (authStatus !== "authenticated") {
        setSavedProfile(null);
        setSavedProfileLoadError("");
        setIsLoadingSavedProfile(false);
        return;
      }

      const cachedProfileItem = getPaperDeckProfile();
      if (cachedProfileItem) {
        setSavedProfile({
          ...cachedProfileItem.payload,
          created_at: cachedProfileItem.created_at,
        });
        setSavedProfileLoadError("");
        setIsLoadingSavedProfile(false);
        if (paperDeckProfileStatus === "idle") {
          void loadPaperDeckProfile(true);
        }
        return;
      }

      if (paperDeckProfileStatus === "loading") {
        setSavedProfileLoadError("");
        setIsLoadingSavedProfile(true);
        return;
      }

      if (paperDeckProfileStatus === "ready") {
        setSavedProfile(null);
        setSavedProfileLoadError("");
        setIsLoadingSavedProfile(false);
        return;
      }

      if (paperDeckProfileStatus === "error") {
        setSavedProfileLoadError(savedProfileLoadFailedText);
        setIsLoadingSavedProfile(false);
        return;
      }

      setSavedProfileLoadError("");
      setIsLoadingSavedProfile(true);
      void loadPaperDeckProfile(false);
    }

    loadSavedProfile();
  }, [authStatus, getPaperDeckProfile, loadPaperDeckProfile, paperDeckProfileStatus, savedProfileLoadFailedText]);

  useEffect(() => {
    if (!isLoadingSavedProfile) {
      if (loadingGuardRef.current) {
        clearTimeout(loadingGuardRef.current);
        loadingGuardRef.current = null;
      }
      return;
    }

    loadingGuardRef.current = setTimeout(() => {
      setSavedProfileLoadError(savedProfileLoadFailedText);
      setIsLoadingSavedProfile(false);
    }, 7000);

    return () => {
      if (loadingGuardRef.current) {
        clearTimeout(loadingGuardRef.current);
        loadingGuardRef.current = null;
      }
    };
  }, [isLoadingSavedProfile, savedProfileLoadFailedText]);

  useEffect(() => {
    setSeeds(initialSeeds || []);
  }, [initialSeeds]);

  useEffect(() => {
    setProfileInfo(initialProfile || null);
  }, [initialProfile]);

  useEffect(() => {
    if (!profileInfo || seeds.length === 0) {
      setDigestPapers([]);
      return;
    }
    loadDigest();
  }, [profileInfo?.embedding?.length, seeds.map((paper) => paper.paper_id).join("|"), excludedPaperIds.join("|"), cardMode, locale]);

  useEffect(() => {
    if (!profileInfo || subscribedVenues.length === 0) {
      setSubscribedDigest([]);
      return;
    }
    loadSubscribedDigest();
  }, [profileInfo?.embedding?.length, subscribedVenues.map((venue) => venue.id).join("|"), excludedPaperIds.join("|"), locale]);

  function invalidateProfile() {
    setProfileInfo(null);
    setSyncStatus("idle");
    setDigestPapers([]);
    setSubscribedDigest([]);
    setGenerationError("");
  }

  function updateSeeds(nextSeeds) {
    setSeeds(nextSeeds);
    onSeedsUpdated?.(nextSeeds);
    invalidateProfile();
  }

  function addSeed(paper) {
    if (!paper || typeof paper.paper_id !== "string" || paper.paper_id.trim().length === 0) {
      return { ok: false, reason: "invalid" };
    }

    const normalizedPaper = {
      ...paper,
      paper_id: paper.paper_id.trim(),
      title: paper.title || "Untitled",
      authors: Array.isArray(paper.authors) ? paper.authors : [],
    };

    if (seeds.length >= 20) return { ok: false, reason: "limit" };
    if (seeds.some((item) => item.paper_id === normalizedPaper.paper_id)) {
      return { ok: false, reason: "duplicate" };
    }

    updateSeeds([...seeds, normalizedPaper]);
    return { ok: true };
  }

  function removeSeed(paperId) {
    updateSeeds(seeds.filter((item) => item.paper_id !== paperId));
  }

  async function handleSearch() {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || searchStatus === "searching") return;

    setSearchError("");
    setSearchResults([]);
    setSearchStatus("searching");

    if (shouldResolveSeedInput(trimmedQuery)) {
      try {
        const paper = await resolveSeedInput(trimmedQuery);
        const result = addSeed(paper);
        if (!result.ok) {
          setSearchError(
            result.reason === "duplicate"
              ? t("seeds.duplicateSeed")
              : result.reason === "limit"
              ? t("seeds.limitReached")
              : t("seeds.manualAddFailed")
          );
          setSearchStatus("error");
          return;
        }

        setQuery("");
        setSearchStatus("idle");
        inputRef.current?.focus();
        return;
      } catch (resolveError) {
        const code = resolveError?.response?.status;
        if (code !== 400) {
          setSearchError(
            code === 429 || code === 503
              ? t("seeds.manualAddRateLimited")
              : code === 404
              ? t("seeds.manualAddNotFound")
              : t("seeds.manualAddApiError")
          );
          setSearchStatus("error");
          return;
        }
      }
    }

    try {
      const results = await searchSeeds(trimmedQuery);
      setSearchResults(results);
      setSearchStatus("done");
    } catch (searchErrorValue) {
      const code = searchErrorValue?.response?.status;
      setSearchError(
        code === 429 || code === 503
          ? t("seeds.manualAddRateLimited")
          : t("seeds.manualAddApiError")
      );
      setSearchStatus("error");
    }
  }

  function restoreSavedProfile() {
    if (!savedProfile) return;

    const restoredSeeds = Array.isArray(savedProfile.seed_papers)
      ? savedProfile.seed_papers.filter((paper) => paper?.paper_id)
      : [];

    const restoredProfile = {
      embedding: Array.isArray(savedProfile.embedding) ? savedProfile.embedding : [],
      seed_count: savedProfile.seed_count ?? restoredSeeds.length,
      seed_papers: restoredSeeds,
    };

    setSeeds(restoredSeeds);
    setProfileInfo(restoredProfile);
    setSyncStatus("saved");
    onProfileGenerated?.(restoredSeeds.map((paper) => paper.paper_id), restoredProfile);
  }

  async function retryLoadSavedProfile() {
    setSavedProfileLoadError("");
    setIsLoadingSavedProfile(true);
    await loadPaperDeckProfile(true);
  }

  async function handleGenerate() {
    if (seeds.length === 0 || isGenerating) return;
    setIsGenerating(true);
    setSearchError("");
    setGenerationError("");

    try {
      const paperIds = seeds.map((item) => item.paper_id);
      const result = await generateProfile(paperIds);
      setProfileInfo(result);
      onProfileGenerated?.(paperIds, result);

      if (authStatus === "authenticated") {
        setSyncStatus("saving");
        const syncResult = await saveInterestProfile(result);
        if (syncResult.ok) {
          setSavedProfile({
            ...syncResult.payload,
            created_at: syncResult.payload.updated_at,
          });
          setSyncStatus("saved");
        } else {
          setSyncStatus("error");
        }
      } else {
        setSyncStatus("idle");
      }
    } catch (error) {
      console.error("Profile generation failed:", error);
      setSyncStatus("error");
      const detail = error?.response?.data?.detail;
      setGenerationError(typeof detail === "string" && detail.trim() ? detail.trim() : generateProfileFailedText);
    }

    setIsGenerating(false);
  }

  async function loadDigest() {
    if (isLoadingDigest || seeds.length === 0) return;
    setIsLoadingDigest(true);
    try {
      const result = await getRecommendations(
        seeds.map((paper) => paper.paper_id),
        10,
        null,
        excludedPaperIds,
        locale,
      );
      setDigestPapers(result.papers || []);
    } catch (error) {
      console.error("Digest fetch failed:", error);
      setDigestPapers([]);
    }
    setIsLoadingDigest(false);
  }

  async function loadSubscribedDigest() {
    if (isLoadingSubscribedDigest || subscribedVenues.length === 0) return;
    setIsLoadingSubscribedDigest(true);
    try {
      const papers = await getSubscriptionFeed({
        venueIds: subscribedVenues.map((venue) => venue.id),
        interestEmbedding: profileInfo?.embedding || null,
        daysBack: 14,
        minSimilarity: 0,
        limit: 6,
        excludePaperIds: excludedPaperIds,
        language: locale,
      });
      setSubscribedDigest(papers);
    } catch (error) {
      console.error("Subscribed digest fetch failed:", error);
      setSubscribedDigest([]);
    }
    setIsLoadingSubscribedDigest(false);
  }

  async function handleOpenImport() {
    setShowImport(true);
    if (authStatus === "authenticated") {
      const items = await loadFavoriteItems(true);
      const atlasItems = items.filter((item) => item.app_id?.startsWith("paperatlas:paper:"));
      setImportItems(atlasItems);
    }
  }

  function handleImportToggle(appId) {
    setImportSelected((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  }

  function handleImportConfirm() {
    const imported = importItems
      .filter((item) => importSelected.has(item.app_id))
      .map((item) => ({
        paper_id: item.payload?.paper_id || "",
        title: item.payload?.title || "Untitled",
        authors: item.payload?.authors || [],
        year: item.payload?.year,
        citation_count: item.payload?.citation_count || 0,
        venue: item.payload?.venue,
        doi: item.payload?.doi,
        url: item.payload?.url,
      }))
      .filter((paper) => paper.paper_id);

    const nextSeeds = [...seeds];
    imported.forEach((paper) => {
      if (nextSeeds.length >= 20) return;
      if (nextSeeds.some((item) => item.paper_id === paper.paper_id)) return;
      nextSeeds.push(paper);
    });

    updateSeeds(nextSeeds);
    setShowImport(false);
    setImportSelected(new Set());
  }

  const savedProfileCount = getProfileSeedCount(savedProfile);
  const savedProfileTime = formatSyncedAt(savedProfile?.updated_at || savedProfile?.created_at);
  const hasDigest = Boolean(profileInfo && seeds.length > 0);
  const ui =
    locale === "en"
      ? {
          heroEyebrow: "Inbox",
          digestHeroTitle: "Your reading inbox",
          digestHeroBody:
            "This page is for deciding what deserves attention now. Draw stays as the surprise layer, while Sources controls where papers come from.",
          searchResultEyebrow: "Seed candidate",
          calibration: "Memory setup",
          calibrationSeedsTitle: "Calibration seeds",
          calibrationSeedsSubtitle: "These papers still define the current memory and can be swapped any time.",
          digestTitle: "Inbox",
          digestSubtitle: "One unified stream for what deserves attention now.",
          recommendedEyebrow: (index) => `Recommended / ${index}`,
          subscribedTitle: "Source signals",
          subscribedSubtitle:
            subscribedVenues.length > 0
              ? "A compact preview of what your followed journals and conferences are adding."
              : "Follow journals or conferences in Sources, then let Inbox decide what matters first.",
          sourceCountLabel: "Followed sources",
          sourceFreshLabel: "Fresh source papers",
          sourceEmpty: "You are not following any journals or conferences yet.",
          sourceTeaserLabel: "Recent source arrivals",
        }
      : {
          heroEyebrow: "Inbox",
          digestHeroTitle: "你的今日文献收件箱",
          digestHeroBody:
            "这里负责决定现在先读什么。抽卡保留惊喜发现，信源页负责管理文献从哪里来。",
          searchResultEyebrow: "种子候选",
          calibration: "记忆设置",
          calibrationSeedsTitle: "校准种子",
          calibrationSeedsSubtitle: "这些论文仍在定义当前兴趣记忆，你可以随时替换它们。",
          digestTitle: "今日收件箱",
          digestSubtitle: "这里是一条统一阅读流，只回答现在该先看什么。",
          recommendedEyebrow: (index) => `推荐 / ${index}`,
          subscribedTitle: "信源概览",
          subscribedSubtitle:
            subscribedVenues.length > 0
              ? "这里只保留一个简洁预览，完整的信源管理和信源流留在信源页。"
              : "先在信源页关注期刊或会议，再让收件箱判断今天先读什么。",
          sourceCountLabel: "已关注信源",
          sourceFreshLabel: "新到信源论文",
          sourceEmpty: "你还没有关注任何期刊或会议。",
          sourceTeaserLabel: "最近进入的信源论文",
        };
  const subscribedPreview = subscribedDigest.slice(0, 3);

  return (
    <div className="space-y-6">
      <section className="paper-surface rounded-[32px] p-6 sm:p-7">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_320px]">
          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-600">
                {hasDigest ? ui.heroEyebrow : t("seeds.memoryEyebrow")}
              </p>
              <h2 className="mt-3 font-heading-cn text-3xl font-semibold text-slate-950">
                {hasDigest ? ui.digestHeroTitle : t("seeds.title")}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                {hasDigest ? ui.digestHeroBody : t("seeds.subtitle")}
              </p>
            </div>

            <div className="flex flex-col gap-3 xl:flex-row">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSearchResults([]);
                  setSearchStatus("idle");
                  setSearchError("");
                }}
                onKeyDown={(event) => event.key === "Enter" && handleSearch()}
                placeholder={t("seeds.searchPlaceholder")}
                className="app-input min-w-0 flex-1 rounded-2xl px-4 py-3.5 text-sm outline-none"
              />
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleSearch}
                  disabled={!query.trim() || searchStatus === "searching" || seeds.length >= 20}
                  className="app-primary-button rounded-2xl px-5 py-3.5 text-sm font-medium disabled:opacity-40"
                >
                  {searchStatus === "searching" ? t("seeds.searching") : t("seeds.search")}
                </button>
                <button
                  onClick={handleOpenImport}
                  disabled={authStatus !== "authenticated"}
                  className="app-outline-button rounded-2xl px-4 py-3.5 text-sm font-medium disabled:opacity-40"
                >
                  {t("seeds.importFromAtlas")}
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-400">{t("seeds.manualHint")}</p>
            {searchError && <p className="text-xs text-rose-600">{searchError}</p>}

            {searchResults.length > 0 && (
              <div className="seed-search-results">
                {searchResults.map((paper) => {
                  const alreadyAdded = seeds.some((item) => item.paper_id === paper.paper_id);
                  const meta = buildSearchRowMeta(paper, locale);
                  return (
                    <div key={paper.paper_id} className="seed-search-row">
                      <div className="seed-search-main">
                        <p className="seed-search-title" title={paper.title}>
                          {paper.title}
                        </p>
                        {meta && (
                          <span className="seed-search-meta" title={meta}>
                            {meta}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          const result = addSeed(paper);
                          if (!result.ok) {
                            setSearchError(
                              result.reason === "duplicate"
                                ? t("seeds.duplicateSeed")
                                : result.reason === "limit"
                                ? t("seeds.limitReached")
                                : t("seeds.manualAddFailed")
                            );
                          }
                        }}
                        disabled={alreadyAdded || seeds.length >= 20}
                        className="app-accent-button seed-search-add rounded-xl px-3.5 py-2 text-sm font-medium disabled:opacity-40"
                      >
                        {alreadyAdded ? t("seeds.added") : t("seeds.add")}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="discover-rail-card">
              <p className="discover-rail-kicker">{ui.calibration}</p>
              <div className="discover-rail-stats">
                <div>
                  <span>{t("seeds.selected")}</span>
                  <strong>{seeds.length}</strong>
                </div>
                <div>
                  <span>{t("seeds.maxSeeds")}</span>
                  <strong>20</strong>
                </div>
              </div>
              <button
                onClick={handleGenerate}
                disabled={isGenerating || seeds.length === 0}
                className="app-accent-button mt-4 w-full rounded-2xl px-6 py-3 text-sm font-semibold disabled:opacity-50"
              >
                {isGenerating ? t("seeds.generating") : t("seeds.generateProfile")}
              </button>
              {generationError && <p className="mt-3 text-xs text-rose-600">{generationError}</p>}
              <button
                onClick={onOpenDraw}
                disabled={!hasDigest}
                className="app-outline-button mt-3 w-full rounded-2xl px-4 py-3 text-sm font-medium disabled:opacity-40"
              >
                {t("seeds.openDraw")}
              </button>
              <button
                onClick={onOpenSubscriptions}
                className="app-outline-button mt-3 w-full rounded-2xl px-4 py-3 text-sm font-medium"
              >
                {t("nav.subscriptions")}
              </button>
              {syncStatus === "saved" && authStatus === "authenticated" && (
                <p className="mt-3 text-xs text-emerald-700">{t("seeds.profileSynced")}</p>
              )}
            </div>

            {(isLoadingSavedProfile || savedProfile || savedProfileLoadError) && (
              <div className="discover-rail-card">
                <p className="discover-rail-kicker">{t("seeds.savedProfile")}</p>
                {isLoadingSavedProfile ? (
                  <p className="mt-2 text-sm text-slate-500">{t("common.loading")}</p>
                ) : savedProfile ? (
                  <div className="space-y-2">
                    <p className="mt-2 text-sm text-slate-500">
                      {savedProfileCount} {t("seeds.savedSeeds")}
                    </p>
                    {savedProfileTime && <p className="text-xs text-slate-400">{savedProfileTime}</p>}
                    <button onClick={restoreSavedProfile} className="app-inline-link mt-2 font-medium hover:underline">
                      {t("seeds.restoreSavedProfile")}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="mt-2 text-sm text-rose-600">{savedProfileLoadError}</p>
                    <button onClick={retryLoadSavedProfile} className="app-inline-link font-medium hover:underline">
                      {retryText}
                    </button>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      </section>

      {seeds.length > 0 && (
        <SectionFrame
          title={hasDigest ? ui.calibrationSeedsTitle : `${seeds.length} ${t("seeds.selected")}`}
          subtitle={hasDigest ? ui.calibrationSeedsSubtitle : null}
          action={
            <button onClick={() => updateSeeds([])} className="text-xs text-slate-400 transition-colors hover:text-rose-500">
              {t("seeds.clear")}
            </button>
          }
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {seeds.map((paper) => (
              <div key={paper.paper_id} className="rounded-2xl border border-slate-100 bg-slate-50/65 px-4 py-3">
                <p className="line-clamp-2 text-sm font-medium text-slate-800">{paper.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {paper.authors?.slice(0, 2).join(", ")}
                  {paper.year ? ` / ${paper.year}` : ""}
                </p>
                <button
                  onClick={() => removeSeed(paper.paper_id)}
                  className="mt-3 text-xs text-slate-400 transition-colors hover:text-rose-500"
                >
                  {t("seeds.remove")}
                </button>
              </div>
            ))}
          </div>
        </SectionFrame>
      )}

      {hasDigest && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_340px]">
          <div className="space-y-6">
            <SectionFrame
              title={ui.digestTitle}
              subtitle={ui.digestSubtitle}
              action={
                <button onClick={loadDigest} className="app-outline-button rounded-2xl px-4 py-2.5 text-sm font-medium">
                  {isLoadingDigest ? t("common.loading") : t("recommend.refresh")}
                </button>
              }
            >
              {digestPapers.length === 0 ? (
                <p className="text-sm text-slate-500">{isLoadingDigest ? t("recommend.loading") : t("recommend.empty")}</p>
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {digestPapers.map((paper, index) => (
                    <PaperDigestCard
                      key={paper.paper_id}
                      paper={paper}
                      eyebrow={ui.recommendedEyebrow(index + 1)}
                      actionLabel={t("recommend.viewCard")}
                      onAction={() => onViewCard?.(paper)}
                      secondaryAction={
                        <button onClick={onOpenDraw} className="app-outline-button rounded-xl px-4 py-2.5 text-sm font-medium">
                          {t("nav.draw")}
                        </button>
                      }
                    />
                  ))}
                </div>
              )}
            </SectionFrame>
          </div>

          <aside className="space-y-6">
            <SectionFrame
              title={memory.headline || t("seeds.memoryTitle")}
              subtitle={memory.venues.length > 0
                ? t("seeds.memorySummary", {
                    venue: memory.venues[0].name,
                    years: memory.yearMin && memory.yearMax ? `${memory.yearMin} - ${memory.yearMax}` : t("seeds.memoryYearsFallback"),
                  })
                : t("seeds.memorySummaryFallback", {
                    years: memory.yearMin && memory.yearMax ? `${memory.yearMin} - ${memory.yearMax}` : t("seeds.memoryYearsFallback"),
                  })}
            >
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <div className="discover-metric-card">
                  <span>{t("seeds.memorySeedCount")}</span>
                  <strong>{memory.papers.length}</strong>
                </div>
                <div className="discover-metric-card">
                  <span>{t("seeds.memoryYears")}</span>
                  <strong>{memory.yearMin && memory.yearMax ? `${memory.yearMin} - ${memory.yearMax}` : t("seeds.memoryYearsFallback")}</strong>
                </div>
                <div className="discover-metric-card">
                  <span>{t("seeds.memoryCitations")}</span>
                  <strong>{memory.avgCitations}</strong>
                </div>
              </div>
              {memory.echoes.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {memory.echoes.map((entry) => (
                    <span key={entry} className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                      {entry}
                    </span>
                  ))}
                </div>
              )}
              {memory.venues.length > 0 && (
                <div className="mt-5 space-y-2">
                  {memory.venues.map((venue) => (
                    <div key={venue.name} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                      <span className="text-sm text-slate-700">{venue.name}</span>
                      <span className="text-xs font-medium text-slate-500">{venue.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionFrame>

            <SectionFrame
              title={ui.subscribedTitle}
              subtitle={ui.subscribedSubtitle}
              action={
                <button onClick={onOpenSubscriptions} className="app-outline-button rounded-2xl px-4 py-2.5 text-sm font-medium">
                  {t("nav.subscriptions")}
                </button>
              }
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="discover-metric-card">
                  <span>{ui.sourceCountLabel}</span>
                  <strong>{subscribedVenues.length}</strong>
                </div>
                <div className="discover-metric-card">
                  <span>{ui.sourceFreshLabel}</span>
                  <strong>{subscribedDigest.length}</strong>
                </div>
              </div>

              {subscribedVenues.length === 0 ? (
                <p className="mt-5 text-sm text-slate-500">{ui.sourceEmpty}</p>
              ) : (
                <>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {subscribedVenues.map((venue) => (
                      <span
                        key={venue.id}
                        className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
                      >
                        {venue.name}
                      </span>
                    ))}
                  </div>

                  <div className="mt-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      {ui.sourceTeaserLabel}
                    </p>
                    <div className="mt-3 space-y-3">
                      {subscribedPreview.length > 0 ? (
                        subscribedPreview.map((paper) => (
                          <button
                            key={paper.paper_id}
                            onClick={() => onViewCard?.(paper)}
                            className="w-full rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-left transition-colors hover:bg-slate-100/80"
                          >
                            <p className="line-clamp-2 text-sm font-medium text-slate-800">
                              {paper.title_zh || paper.title}
                            </p>
                            {paper.title_zh && paper.title_zh !== paper.title && (
                              <p className="mt-1 line-clamp-2 text-xs text-slate-500">{paper.title}</p>
                            )}
                            {paper.card_content?.plain_summary && (
                              <p className="mt-2 line-clamp-3 text-xs leading-6 text-slate-600">
                                {paper.card_content.plain_summary}
                              </p>
                            )}
                            <p className="mt-1 text-xs text-slate-500">
                              {[paper.venue, paper.year].filter(Boolean).join(" / ")}
                            </p>
                          </button>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">
                          {isLoadingSubscribedDigest ? t("common.loading") : t("sub.emptyFeed")}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </SectionFrame>
          </aside>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="app-dialog mx-4 max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="font-heading-cn text-base font-semibold">{t("seeds.importTitle")}</h3>
              <button onClick={() => setShowImport(false)} className="text-slate-400 hover:text-slate-600">
                {t("common.close")}
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto p-4">
              {authStatus !== "authenticated" ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  <button onClick={startLogin} className="app-inline-link hover:underline">
                    {t("auth.signIn")}
                  </button>
                </p>
              ) : importItems.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">{t("seeds.importEmpty")}</p>
              ) : (
                <div className="space-y-2">
                  {importItems.map((item) => (
                    <label
                      key={item.app_id}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-100 px-4 py-3 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={importSelected.has(item.app_id)}
                        onChange={() => handleImportToggle(item.app_id)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-medium text-slate-800">{item.payload?.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {item.payload?.year || ""} / {item.payload?.citation_count || 0} cites
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {importSelected.size > 0 && (
              <div className="border-t border-slate-100 px-6 py-4">
                <button
                  onClick={handleImportConfirm}
                  className="app-accent-button w-full rounded-xl py-2.5 text-sm font-semibold"
                >
                  {t("seeds.importSelected")} ({importSelected.size})
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
