import { useEffect, useMemo, useState } from "react";
import { useScanSciAuth } from "../../auth";
import { useLanguage } from "../../i18n";
import PaperCard from "../cards/PaperCard";
import { getZoneLabel } from "../cards/TierBadge";

const ZONES = ["1区", "2区", "3区", "4区", "Unrated"];

export default function LibraryView({ cardMode, onViewCard }) {
  const { t } = useLanguage();
  const { status: authStatus, startLogin, loadFavoriteItems, getCardCollection } = useScanSciAuth();
  const [filterZone, setFilterZone] = useState("all");
  const [sortBy, setSortBy] = useState("date");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (authStatus === "authenticated" && !loaded) {
      loadFavoriteItems(true).then(() => setLoaded(true));
    }
  }, [authStatus, loadFavoriteItems, loaded]);

  const cards = useMemo(() => {
    const collection = getCardCollection();
    let items = collection.map((item) => ({
      paper_id: item.payload?.paper_id || "",
      title: item.payload?.title || "Untitled",
      title_zh: item.payload?.title_zh || "",
      authors: item.payload?.authors || [],
      year: item.payload?.year,
      venue: item.payload?.venue,
      citation_count: item.payload?.citation_count || 0,
      similarity_score: item.payload?.similarity_score || 0,
      doi: item.payload?.doi,
      url: item.payload?.url,
      tier: item.payload?.tier || "N",
      zone: item.payload?.zone || null,
      issn: item.payload?.issn || null,
      eissn: item.payload?.eissn || null,
      mode: item.payload?.mode || "research",
      card_content: item.payload?.card_content || null,
      created_at: item.created_at,
    }));

    if (filterZone !== "all") {
      items = items.filter((card) => getZoneLabel(card.zone || card.tier) === filterZone);
    }

    if (sortBy === "citations") {
      items.sort((left, right) => (right.citation_count || 0) - (left.citation_count || 0));
    } else if (sortBy === "year") {
      items.sort((left, right) => (right.year || 0) - (left.year || 0));
    }

    return items;
  }, [filterZone, getCardCollection, sortBy, loaded]);

  return (
    <div className="space-y-6">
      <div className="paper-surface rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-heading text-lg font-semibold text-slate-900">
              {t("library.title")} ({cards.length})
            </h2>
            {authStatus !== "authenticated" && (
              <p className="mt-1 text-xs text-slate-500">
                {t("library.localModePrefix")}{" "}
                <button onClick={startLogin} className="app-inline-link font-medium hover:underline">
                  {t("auth.signIn")}
                </button>{" "}
                {t("library.localModeSuffix")}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="app-segmented flex flex-wrap items-center gap-1 rounded-lg p-0.5">
              <button
                onClick={() => setFilterZone("all")}
                className={`app-segment-button rounded-md px-2.5 py-1 text-[11px] font-medium ${
                  filterZone === "all" ? "is-active" : ""
                }`}
              >
                {t("library.filterAll")}
              </button>
              {ZONES.map((zone) => (
                <button
                  key={zone}
                  onClick={() => setFilterZone(zone)}
                  className={`app-segment-button rounded-md px-2 py-1 text-[11px] font-bold ${
                    filterZone === zone ? "is-active" : ""
                  }`}
                >
                  {zone}
                </button>
              ))}
            </div>

            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="app-select rounded-lg px-3 py-1.5 text-xs outline-none"
            >
              <option value="date">{t("library.sortDate")}</option>
              <option value="citations">{t("library.sortCitations")}</option>
              <option value="year">{t("library.sortYear")}</option>
            </select>
          </div>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-slate-500">{t("library.empty")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <PaperCard
              key={card.paper_id}
              card={card}
              mode={card.mode || cardMode}
              compact
              onClick={() => onViewCard(card)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
