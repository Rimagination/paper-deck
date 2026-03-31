import { useEffect, useMemo, useRef, useState } from "react";
import { useScanSciAuth } from "../../auth";
import { generateProfile, resolveSeedInput, searchSeeds } from "../../api/backend";
import { useLanguage } from "../../i18n";
import { getZoneLabel } from "../cards/TierBadge";
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
  if (paper.venue) parts.push(paper.venue);
  if (paper.year) parts.push(String(paper.year));
  if (paper.citation_count) {
    parts.push(locale === "en" ? `${paper.citation_count} cites` : `${paper.citation_count} 引用`);
  }
  return parts.join(" / ");
}

function buildTimeSpan(memory, t) {
  return memory.yearMin && memory.yearMax
    ? `${memory.yearMin} - ${memory.yearMax}`
    : t("seeds.memoryYearsFallback");
}

function estimateKeywordVisualUnits(word) {
  return Array.from(String(word || "")).reduce((total, char) => {
    if (/[\u3400-\u9fff\uf900-\ufaff]/u.test(char)) return total + 1;
    if (/[A-Z]/.test(char)) return total + 0.72;
    if (/[a-z0-9]/.test(char)) return total + 0.62;
    if (/[\s/+-]/.test(char)) return total + 0.3;
    return total + 0.56;
  }, 0);
}

function buildKeywordCloudLayout(keywordEntries) {
  const width = 1000;
  const height = 420;
  const centerX = width / 2;
  const centerY = height / 2 + 10;
  const baseEntries = Array.isArray(keywordEntries) ? keywordEntries.filter((entry) => entry?.word) : [];

  if (baseEntries.length === 0) return [];

  const maxKeywordCount = Math.max(...baseEntries.map((entry) => entry.count || 0), 1);
  const placed = [];

  return [...baseEntries]
    .sort((left, right) => (right.count || 0) - (left.count || 0))
    .map((entry, index) => {
      const ratio = Math.max(0.2, (entry.count || 0) / maxKeywordCount);
      const fontSize = 16 + ratio * 22;
      const units = estimateKeywordVisualUnits(entry.word);
      const wordWidth = Math.max(72, units * fontSize * 0.68 + 18);
      const wordHeight = fontSize * 1.18;
      const padding = 12;

      let candidate = {
        left: centerX - wordWidth / 2,
        top: centerY - wordHeight / 2,
      };
      let found = false;

      for (let step = 0; step < 520; step += 1) {
        const angle = step * 0.58 + index * 0.3;
        const radius = 10 + step * 2.6;
        const x = centerX + Math.cos(angle) * radius - wordWidth / 2;
        const y = centerY + Math.sin(angle) * radius * 0.72 - wordHeight / 2;
        const fitsBounds =
          x >= padding &&
          y >= padding &&
          x + wordWidth <= width - padding &&
          y + wordHeight <= height - padding;
        if (!fitsBounds) continue;

        const overlaps = placed.some((item) => {
          const horizontalGap = Math.min(x + wordWidth, item.left + item.width) - Math.max(x, item.left);
          const verticalGap = Math.min(y + wordHeight, item.top + item.height) - Math.max(y, item.top);
          return horizontalGap > 8 && verticalGap > 6;
        });

        if (!overlaps) {
          candidate = { left: x, top: y };
          found = true;
          break;
        }
      }

      if (!found) {
        candidate.left = Math.max(padding, Math.min(candidate.left, width - wordWidth - padding));
        candidate.top = Math.max(padding, Math.min(candidate.top, height - wordHeight - padding));
      }

      const placement = {
        ...entry,
        left: ((candidate.left + wordWidth / 2) / width) * 100,
        top: ((candidate.top + wordHeight / 2) / height) * 100,
        fontSize,
        opacity: 0.48 + ratio * 0.42,
        rotate: index % 5 === 0 ? -8 : index % 4 === 0 ? 7 : index % 3 === 0 ? -4 : 0,
      };

      placed.push({
        left: candidate.left,
        top: candidate.top,
        width: wordWidth,
        height: wordHeight,
      });

      return placement;
    });
}

function SectionFrame({ title, subtitle, action, children }) {
  return (
    <section className="paper-surface rounded-[28px] p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold" style={{ color: "var(--text-main)" }}>
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function CompactMemoryPanel({ memory, locale, t, onOpenDraw }) {
  const timeSpan = buildTimeSpan(memory, t);
  const dominantZoneLabel = memory.dominantZone ? getZoneLabel(memory.dominantZone) : null;
  const cloudWords = useMemo(() => buildKeywordCloudLayout(memory.keywordEntries), [memory.keywordEntries]);
  const stats =
    locale === "en"
      ? [
          { label: "Seeds", value: memory.papers.length },
          { label: "Years", value: timeSpan },
          { label: "Cites", value: memory.avgCitations },
          { label: "Zone", value: dominantZoneLabel || "Unrated" },
        ]
      : [
          { label: "\u79cd\u5b50", value: memory.papers.length },
          { label: "\u65f6\u95f4", value: timeSpan },
          { label: "\u5f15\u6587", value: memory.avgCitations },
          { label: "\u5206\u533a", value: dominantZoneLabel || "\u5f85\u5b9a" },
        ];

  const heading = locale === "en" ? "Interest memory is now in shape" : "\u5174\u8da3\u8bb0\u5fc6\u5df2\u7ecf\u6210\u5f62";
  const description =
    memory.venues.length > 0
      ? t("seeds.memorySummary", { venue: memory.venues[0].name, years: timeSpan })
      : t("seeds.memorySummaryFallback", { years: timeSpan });

  return (
    <section className="paper-surface rounded-[30px] p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-600">
            {t("seeds.memoryEyebrow")}
          </p>
          <h3 className="mt-3 font-heading-cn text-2xl font-semibold sm:text-3xl" style={{ color: "var(--text-main)" }}>
            {heading}
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-7" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        </div>
        <button
          onClick={onOpenDraw}
          className="app-accent-button rounded-2xl px-5 py-3 text-sm font-semibold"
        >
          {t("seeds.openDraw")}
        </button>
      </div>

      <div className="discover-memory-layout mt-7">
        <div className="discover-memory-cloud">
          <div className="discover-memory-cloud-grid" aria-hidden="true" />
          <div className="discover-memory-cloud-glow discover-memory-cloud-glow-a" aria-hidden="true" />
          <div className="discover-memory-cloud-glow discover-memory-cloud-glow-b" aria-hidden="true" />
          <div className="discover-memory-cloud-glow discover-memory-cloud-glow-c" aria-hidden="true" />
          <div className="discover-memory-cloud-copy">
            <p className="discover-memory-cloud-kicker">{t("seeds.memoryCloudEyebrow")}</p>
            <p className="discover-memory-cloud-headline">{memory.headline}</p>
          </div>
          <div className="discover-memory-word-cloud">
            {cloudWords.length > 0 ? (
              cloudWords.map((entry) => (
                <span
                  key={entry.word}
                  className="discover-memory-word"
                  style={{
                    "--cloud-opacity": entry.opacity.toFixed(2),
                    "--cloud-rotate": `${entry.rotate}deg`,
                    left: `${entry.left.toFixed(2)}%`,
                    top: `${entry.top.toFixed(2)}%`,
                    fontSize: `${entry.fontSize.toFixed(1)}px`,
                  }}
                >
                  {entry.word}
                </span>
              ))
            ) : (
              <span className="discover-memory-word is-empty">
                {locale === "en" ? "Keywords will appear once papers carry enough metadata." : "\u5173\u952e\u8bcd\u4f1a\u5728\u8bba\u6587\u4fe1\u606f\u8db3\u591f\u540e\u51fa\u73b0"}
              </span>
            )}
          </div>
        </div>

        <aside className="discover-memory-inspector">
          <div className="discover-memory-stat-grid">
            {stats.map((item) => (
              <div key={item.label} className="discover-memory-stat">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>

          {memory.echoes.length > 0 ? (
            <div className="discover-memory-panel">
              <p className="discover-memory-panel-label">
                {locale === "en" ? "Echoes" : "\u56de\u54cd"}
              </p>
              <div className="discover-memory-chip-row">
                {memory.echoes.map((entry) => (
                  <span key={entry} className="discover-memory-chip">
                    {entry}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="discover-memory-panel">
            <p className="discover-memory-panel-label">
              {locale === "en" ? "Sources" : "\u6765\u6e90"}
            </p>
            <div className="discover-memory-source-list">
              {memory.venues.length > 0 ? (
                memory.venues.map((venue) => (
                  <div key={venue.name} className="discover-memory-source-row">
                    <span>{venue.name}</span>
                    <strong>{venue.count}</strong>
                  </div>
                ))
              ) : (
                <p className="discover-memory-empty">
                  {locale === "en"
                    ? "Venue clusters appear once the selected papers carry source metadata."
                    : "\u8bba\u6587\u6765\u6e90\u66f4\u5b8c\u6574\u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a\u7ecf\u5e38\u51fa\u73b0\u7684\u671f\u520a\u548c\u4f1a\u8bae"}
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

export default function SeedView({
  initialSeeds,
  initialProfile,
  onProfileGenerated,
  onSeedsUpdated,
  onOpenDraw,
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
  const inputRef = useRef(null);
  const loadingGuardRef = useRef(null);

  const savedProfileLoadFailedText =
    locale === "en"
      ? "Saved profile could not be loaded right now."
      : "\u6682\u65f6\u65e0\u6cd5\u52a0\u8f7d\u5df2\u4fdd\u5b58\u7684\u5174\u8da3\u8bb0\u5fc6";
  const retryText = locale === "en" ? "Retry" : "\u91cd\u8bd5";
  const generateProfileFailedText =
    locale === "en"
      ? "Interest memory could not be generated right now."
      : "\u6682\u65f6\u65e0\u6cd5\u751f\u6210\u5174\u8da3\u8bb0\u5fc6";
  const ui =
    locale === "en"
      ? {
          heroTitle: "Calibrate your research taste",
          heroBody:
            "Search a few anchor papers first. PaperDeck will distill the shared topics, venues, and citation texture into a compact interest memory.",
          searchResultEyebrow: "Seed candidate",
          memorySettings: "Memory setup",
          selectedSeedsTitle: "Selected seed papers",
          selectedSeedsSubtitle: "These papers define the current interest memory.",
        }
      : {
          heroTitle: "\u6821\u51c6\u4f60\u7684\u7814\u7a76\u504f\u597d",
          heroBody:
            "\u5148\u7528\u51e0\u7bc7\u5173\u952e\u8bba\u6587\u6821\u51c6\u4f60\u7684\u5174\u8da3\u8bb0\u5fc6\uff0cPaperDeck \u4f1a\u628a\u5b83\u4eec\u5171\u540c\u7684\u4e3b\u9898\u3001\u6765\u6e90\u548c\u5f15\u6587\u8d28\u611f\u63d0\u70bc\u6210\u4e00\u5f20\u7d27\u51d1\u7684\u8bb0\u5fc6\u56fe\u8c31",
          searchResultEyebrow: "\u79cd\u5b50\u5019\u9009",
          memorySettings: "\u8bb0\u5fc6\u8bbe\u7f6e",
          selectedSeedsTitle: "\u5df2\u9009\u79cd\u5b50\u8bba\u6587",
          selectedSeedsSubtitle: "\u8fd9\u4e9b\u8bba\u6587\u6b63\u5728\u5b9a\u4e49\u5f53\u524d\u7684\u5174\u8da3\u8bb0\u5fc6",
        };

  const memory = useMemo(() => buildInterestMemory(profileInfo), [profileInfo]);

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

  function invalidateProfile() {
    setProfileInfo(null);
    setSyncStatus("idle");
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
      const result = await generateProfile(paperIds, seeds);
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
  const hasProfile = Boolean(profileInfo && seeds.length > 0);

  return (
    <div className="space-y-6">
      <section className="paper-surface rounded-[32px] p-6 sm:p-7">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_320px]">
          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-600">
                {t("seeds.memoryEyebrow")}
              </p>
              <h2 className="mt-3 font-heading-cn text-3xl font-semibold text-slate-950">
                {ui.heroTitle}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                {ui.heroBody}
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
            {searchError ? <p className="text-xs text-rose-600">{searchError}</p> : null}

            {searchResults.length > 0 ? (
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
                        {meta ? (
                          <span className="seed-search-meta" title={meta}>
                            {meta}
                          </span>
                        ) : null}
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
            ) : null}
          </div>

          <aside className="space-y-4">
            <div className="discover-rail-card">
              <p className="discover-rail-kicker">{ui.memorySettings}</p>
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
              {generationError ? <p className="mt-3 text-xs text-rose-600">{generationError}</p> : null}
              <button
                onClick={onOpenDraw}
                disabled={!hasProfile}
                className="app-outline-button mt-3 w-full rounded-2xl px-4 py-3 text-sm font-medium disabled:opacity-40"
              >
                {t("seeds.openDraw")}
              </button>
              {syncStatus === "saved" && authStatus === "authenticated" ? (
                <p className="mt-3 text-xs text-emerald-700">{t("seeds.profileSynced")}</p>
              ) : null}
            </div>

            {(isLoadingSavedProfile || savedProfile || savedProfileLoadError) ? (
              <div className="discover-rail-card">
                <p className="discover-rail-kicker">{t("seeds.savedProfile")}</p>
                {isLoadingSavedProfile ? (
                  <p className="mt-2 text-sm text-slate-500">{t("common.loading")}</p>
                ) : savedProfile ? (
                  <div className="space-y-2">
                    <p className="mt-2 text-sm text-slate-500">
                      {savedProfileCount} {t("seeds.savedSeeds")}
                    </p>
                    {savedProfileTime ? <p className="text-xs text-slate-400">{savedProfileTime}</p> : null}
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
            ) : null}
          </aside>
        </div>
      </section>

      {seeds.length > 0 ? (
        <SectionFrame
          title={ui.selectedSeedsTitle}
          subtitle={ui.selectedSeedsSubtitle}
          action={
            <button
              onClick={() => updateSeeds([])}
              className="text-xs text-slate-400 transition-colors hover:text-rose-500"
            >
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
      ) : null}

      {hasProfile ? (
        <CompactMemoryPanel memory={memory} locale={locale} t={t} onOpenDraw={onOpenDraw} />
      ) : null}

      {showImport ? (
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
            {importSelected.size > 0 ? (
              <div className="border-t border-slate-100 px-6 py-4">
                <button
                  onClick={handleImportConfirm}
                  className="app-accent-button w-full rounded-xl py-2.5 text-sm font-semibold"
                >
                  {t("seeds.importSelected")} ({importSelected.size})
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
