import { useEffect, useMemo, useState } from "react";
import { useScanSciAuth } from "../../auth";
import { useLanguage } from "../../i18n";
import { isCardRead, markCardRead } from "../../readingState";
import PaperCard from "../cards/PaperCard";
import { getCardThemeGroup } from "../cards/cardContent";
import { getZoneLabel } from "../cards/TierBadge";

function GroupHeader({ title, count }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">{count}</span>
    </div>
  );
}

export default function LibraryView({ cardMode, onViewCard }) {
  const { t, locale } = useLanguage();
  const { status: authStatus, startLogin, loadFavoriteItems, getCardCollection } = useScanSciAuth();
  const [modeFilter, setModeFilter] = useState("all");
  const [readFilter, setReadFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date");
  const [loaded, setLoaded] = useState(false);
  const ui =
    locale === "en"
      ? {
          allStates: "All states",
          read: "Read",
          unread: "Unread",
        }
      : {
          allStates: "全部状态",
          read: "已读",
          unread: "未读",
        };

  useEffect(() => {
    if (authStatus === "authenticated" && !loaded) {
      loadFavoriteItems(true).then(() => setLoaded(true));
    }
  }, [authStatus, loadFavoriteItems, loaded]);

  const groupedCards = useMemo(() => {
    const collection = getCardCollection();
    let items = collection.map((item) => {
      const payload = item.payload || {};
      const card = {
        paper_id: payload.paper_id || "",
        title: payload.title || "Untitled",
        title_zh: payload.title_zh || "",
        authors: payload.authors || [],
        year: payload.year,
        venue: payload.venue,
        citation_count: payload.citation_count || 0,
        similarity_score: payload.similarity_score || 0,
        doi: payload.doi,
        url: payload.url,
        tier: payload.tier || "N",
        zone: payload.zone || null,
        issn: payload.issn || null,
        eissn: payload.eissn || null,
        mode: payload.mode || "research",
        language: payload.language || "zh",
        card_content: payload.card_content || null,
        created_at: item.created_at,
      };
      return {
        ...card,
        readAt: isCardRead(card.paper_id),
        themeGroup: getCardThemeGroup(card),
        zoneLabel: getZoneLabel(card.zone || card.tier),
      };
    });

    if (modeFilter !== "all") {
      items = items.filter((card) => card.mode === modeFilter);
    }
    if (readFilter === "read") {
      items = items.filter((card) => card.readAt);
    } else if (readFilter === "unread") {
      items = items.filter((card) => !card.readAt);
    }

    items.sort((left, right) => {
      if (sortBy === "citations") return (right.citation_count || 0) - (left.citation_count || 0);
      if (sortBy === "year") return (right.year || 0) - (left.year || 0);
      return (Date.parse(right.created_at || "") || 0) - (Date.parse(left.created_at || "") || 0);
    });

    const groups = new Map();
    items.forEach((card) => {
      const key = card.themeGroup || "General";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(card);
    });

    return [...groups.entries()];
  }, [getCardCollection, modeFilter, readFilter, sortBy, loaded]);

  return (
    <div className="space-y-6">
      <div className="paper-surface rounded-[28px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-heading text-lg font-semibold text-slate-900">
              {t("library.title")} ({groupedCards.reduce((sum, [, cards]) => sum + cards.length, 0)})
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
            <div className="app-segmented flex items-center gap-1 rounded-lg p-1">
              {[
                { key: "all", label: t("library.filterAll") },
                { key: "research", label: t("card.researchMode") },
                { key: "discovery", label: t("card.discoveryMode") },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setModeFilter(item.key)}
                  className={`app-segment-button rounded-md px-3 py-1.5 text-[11px] font-medium ${modeFilter === item.key ? "is-active" : ""}`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <select
              value={readFilter}
              onChange={(event) => setReadFilter(event.target.value)}
              className="app-select rounded-lg px-3 py-1.5 text-xs outline-none"
            >
              <option value="all">{ui.allStates}</option>
              <option value="read">{ui.read}</option>
              <option value="unread">{ui.unread}</option>
            </select>

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

      {groupedCards.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-slate-500">{t("library.empty")}</p>
        </div>
      ) : (
        groupedCards.map(([group, cards]) => (
          <section key={group} className="paper-surface rounded-[28px] p-6">
            <GroupHeader title={group} count={cards.length} />
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map((card) => (
                <div key={card.paper_id} className="space-y-2">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">
                      {card.mode === "research" ? t("card.researchMode") : t("card.discoveryMode")}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${card.readAt ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {card.readAt ? ui.read : ui.unread}
                    </span>
                  </div>
                  <PaperCard
                    card={card}
                    mode={card.mode || cardMode}
                    compact
                    onClick={() => {
                      markCardRead(card.paper_id);
                      onViewCard(card);
                    }}
                  />
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
