import { useEffect, useRef, useState } from "react";
import { useScanSciAuth } from "../../auth";
import { useLanguage } from "../../i18n";
import { generateProfile, resolveSeedInput, searchSeeds } from "../../api/backend";
import { PAPERDECK_PROFILE_APP_ID } from "../../api/scansci";
import InterestWorkspace from "./InterestWorkspace";

function getProfileSeedCount(profile) {
  if (!profile) return 0;
  if (Array.isArray(profile.seed_papers) && profile.seed_papers.length > 0) {
    return profile.seed_papers.length;
  }
  return profile.seed_count || 0;
}

function formatSyncedAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function SeedView({
  initialSeeds,
  initialProfile,
  onProfileGenerated,
  onSeedsUpdated,
  onOpenDraw,
}) {
  const { t } = useLanguage();
  const { status: authStatus, startLogin, loadFavoriteItems, saveInterestProfile } = useScanSciAuth();

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState("idle");
  const [searchError, setSearchError] = useState("");
  const [seeds, setSeeds] = useState(() => initialSeeds || []);
  const [isGenerating, setIsGenerating] = useState(false);
  const [profileInfo, setProfileInfo] = useState(() => initialProfile || null);
  const [showImport, setShowImport] = useState(false);
  const [importItems, setImportItems] = useState([]);
  const [importSelected, setImportSelected] = useState(new Set());
  const [savedProfile, setSavedProfile] = useState(null);
  const [isLoadingSavedProfile, setIsLoadingSavedProfile] = useState(false);
  const [syncStatus, setSyncStatus] = useState("idle");
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedProfile() {
      if (authStatus !== "authenticated") {
        setSavedProfile(null);
        setIsLoadingSavedProfile(false);
        return;
      }

      setIsLoadingSavedProfile(true);
      try {
        const items = await loadFavoriteItems(true);
        if (cancelled) return;

        const profileItem = items.find((item) => item.app_id === PAPERDECK_PROFILE_APP_ID);
        if (!profileItem) {
          setSavedProfile(null);
          return;
        }

        setSavedProfile({
          ...profileItem.payload,
          created_at: profileItem.created_at,
        });
      } finally {
        if (!cancelled) {
          setIsLoadingSavedProfile(false);
        }
      }
    }

    loadSavedProfile();
    return () => {
      cancelled = true;
    };
  }, [authStatus, loadFavoriteItems]);

  useEffect(() => {
    setSeeds(initialSeeds || []);
  }, [initialSeeds]);

  useEffect(() => {
    setProfileInfo(initialProfile || null);
  }, [initialProfile]);

  function invalidateProfile() {
    setProfileInfo(null);
    setSyncStatus("idle");
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

  async function handleGenerate() {
    if (seeds.length === 0 || isGenerating) return;

    setIsGenerating(true);
    setSearchError("");

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

  return (
    <div className="space-y-6">
      <section className="paper-surface rounded-[28px] p-6 sm:p-7">
        <div className="max-w-3xl">
          <h2 className="font-heading text-2xl font-semibold text-slate-950">{t("seeds.title")}</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">{t("seeds.subtitle")}</p>
        </div>

        <div className="mt-6 flex flex-col gap-3 xl:flex-row">
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

        <p className="mt-3 text-xs text-slate-400">{t("seeds.manualHint")}</p>
        {searchError && <p className="mt-2 text-xs text-rose-600">{searchError}</p>}
        {searchStatus === "done" && searchResults.length === 0 && (
          <p className="mt-2 text-xs text-slate-400">{t("seeds.noResults")}</p>
        )}

        {searchResults.length > 0 && (
          <div className="mt-4 space-y-2">
            {searchResults.map((paper) => {
              const alreadyAdded = seeds.some((item) => item.paper_id === paper.paper_id);
              return (
                <div
                  key={paper.paper_id}
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-medium text-slate-900">{paper.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {paper.authors?.slice(0, 3).join(", ")}
                      {paper.year ? ` / ${paper.year}` : ""}
                      {paper.citation_count ? ` / ${paper.citation_count} cites` : ""}
                    </p>
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
                    className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors disabled:opacity-40 ${
                      alreadyAdded
                        ? "cursor-default bg-emerald-50 text-emerald-600"
                        : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    }`}
                  >
                    {alreadyAdded ? t("seeds.added") : t("seeds.add")}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-4 text-xs text-slate-400">
          {seeds.length}/20 {t("seeds.maxSeeds")}
        </p>
      </section>

      {authStatus === "authenticated" && (isLoadingSavedProfile || savedProfile) && (
        <section className="paper-surface rounded-[28px] p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">{t("seeds.savedProfile")}</h3>
              {isLoadingSavedProfile ? (
                <p className="mt-1 text-sm text-slate-500">{t("common.loading")}</p>
              ) : savedProfile ? (
                <div className="mt-1 space-y-1 text-sm text-slate-500">
                  <p>
                    {savedProfileCount} {t("seeds.savedSeeds")}
                  </p>
                  {savedProfileTime && (
                    <p>
                      {t("seeds.syncedAt")}: {savedProfileTime}
                    </p>
                  )}
                </div>
              ) : null}
            </div>

            {savedProfile && (
              <button
                onClick={restoreSavedProfile}
                className="app-outline-button rounded-2xl px-4 py-2.5 text-sm font-medium"
              >
                {t("seeds.restoreSavedProfile")}
              </button>
            )}
          </div>
        </section>
      )}

      {seeds.length > 0 && (
        <section className="paper-surface rounded-[28px] p-6 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-700">
              {seeds.length} {t("seeds.selected")}
            </h3>
            <button
              onClick={() => updateSeeds([])}
              className="text-xs text-slate-400 transition-colors hover:text-rose-500"
            >
              {t("seeds.clear")}
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {seeds.map((paper) => (
              <div
                key={paper.paper_id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/65 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-medium text-slate-800">{paper.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {paper.authors?.slice(0, 2).join(", ")}
                    {paper.year ? ` / ${paper.year}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => removeSeed(paper.paper_id)}
                  className="text-xs text-slate-400 transition-colors hover:text-rose-500"
                >
                  {t("seeds.remove")}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || seeds.length === 0}
              className="app-accent-button rounded-2xl px-6 py-3 text-sm font-semibold disabled:opacity-50"
            >
              {isGenerating ? t("seeds.generating") : t("seeds.generateProfile")}
            </button>

            {profileInfo && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span>
                  {t("seeds.profileReady")} / {profileInfo.seed_count} {t("seeds.seedsWithEmbedding")}
                </span>
              </div>
            )}

            {syncStatus === "saving" && (
              <span className="text-sm text-slate-500">{t("seeds.syncingProfile")}</span>
            )}
            {syncStatus === "saved" && authStatus === "authenticated" && (
              <span className="text-sm text-emerald-700">{t("seeds.profileSynced")}</span>
            )}
            {syncStatus === "error" && (
              <span className="text-sm text-rose-600">{t("seeds.profileSyncFailed")}</span>
            )}
          </div>
        </section>
      )}

      {profileInfo && (
        <InterestWorkspace
          profileInfo={profileInfo}
          onOpenDraw={onOpenDraw}
          t={t}
        />
      )}

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="app-dialog mx-4 max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="font-heading text-base font-semibold">{t("seeds.importTitle")}</h3>
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
