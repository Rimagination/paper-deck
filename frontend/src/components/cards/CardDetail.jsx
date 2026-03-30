import { useEffect, useMemo, useState } from "react";
import { useScanSciAuth } from "../../auth";
import { useLanguage } from "../../i18n";
import { generateCard } from "../../api/backend";
import { markCardRead } from "../../readingState";
import PaperCard from "./PaperCard";
import ReadingPanel from "./ReadingPanel";

function MetaPill({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div className="detail-meta-pill">
      <span className="detail-meta-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildModeCache(card) {
  if (!card) return { research: null, discovery: null };
  return {
    research: card.mode === "research" && card.card_content ? card : null,
    discovery: card.mode === "discovery" && card.card_content ? card : null,
  };
}

export default function CardDetail({ card, mode, onClose }) {
  const { t, locale } = useLanguage();
  const { isFavorite, toggleFavorite } = useScanSciAuth();
  const [currentMode, setCurrentMode] = useState(mode);
  const [modeCards, setModeCards] = useState(() => buildModeCache(card));
  const [isLoadingMode, setIsLoadingMode] = useState(false);
  const [modeError, setModeError] = useState("");

  useEffect(() => {
    setCurrentMode(mode);
    setModeCards(buildModeCache(card));
    setModeError("");
  }, [card, mode]);

  const cachedCard = modeCards[currentMode];
  const fallbackCard = cachedCard || modeCards.research || modeCards.discovery || card;
  const cardData = useMemo(
    () => (fallbackCard ? { ...fallbackCard, mode: currentMode } : null),
    [fallbackCard, currentMode],
  );
  const collected = isFavorite(cardData || card);

  useEffect(() => {
    let cancelled = false;

    async function ensureCardContent() {
      if (!card?.paper_id) return;
      if (cachedCard?.card_content && cachedCard.language === locale) {
        markCardRead(cachedCard.paper_id);
        return;
      }

      setIsLoadingMode(true);
      setModeError("");

      try {
        const nextCard = await generateCard(card.paper_id, currentMode, locale);
        if (!cancelled) {
          const merged = {
            ...nextCard,
            abstract:
              nextCard.abstract ||
              cachedCard?.abstract ||
              modeCards.research?.abstract ||
              modeCards.discovery?.abstract ||
              card.abstract ||
              null,
          };
          setModeCards((prev) => ({ ...prev, [currentMode]: merged }));
          markCardRead(merged.paper_id);
        }
      } catch (error) {
        console.error("Failed to generate card:", error);
        if (!cancelled) {
          setModeError(
            locale === "zh"
              ? "当前无法补全另一种卡面，先用现有信息继续阅读。"
              : "Unable to load the alternate card right now. Showing the available content instead.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMode(false);
        }
      }
    }

    ensureCardContent();
    return () => {
      cancelled = true;
    };
  }, [
    cachedCard?.card_content,
    cachedCard?.language,
    cachedCard?.abstract,
    card?.abstract,
    card?.paper_id,
    currentMode,
    locale,
    modeCards.discovery?.abstract,
    modeCards.research?.abstract,
  ]);

  async function handleCollect() {
    if (!cardData) return;
    await toggleFavorite(cardData, cardData.zone || cardData.tier, currentMode);
  }

  const authorLine = useMemo(() => {
    const authors = Array.isArray(cardData?.authors) ? cardData.authors.slice(0, 4).join(", ") : "";
    return authors || "Unknown";
  }, [cardData?.authors]);

  const ui =
    locale === "en"
      ? {
          venue: "Venue",
          year: "Year",
          zone: "Zone",
          readingEyebrow: "Reading View",
          readingTitle: "Research interpretation",
          quickEyebrow: "Quick Read",
          quickTitle: "Fast paper brief",
          fallbackNotice: "Current content is being inferred from the available card data.",
        }
      : {
          venue: "来源",
          year: "年份",
          zone: "分区",
          readingEyebrow: "研究阅读",
          readingTitle: "结构化研究解读",
          quickEyebrow: "快速速览",
          quickTitle: "论文速览简报",
          fallbackNotice: "当前内容正在基于已有卡面信息做兼容推导。",
        };

  return (
    <div className="detail-backdrop" onClick={onClose}>
      <div className="detail-shell" onClick={(event) => event.stopPropagation()}>
        <div className="detail-header">
          <div>
            <p className="detail-kicker">{currentMode === "research" ? t("card.researchMode") : t("card.discoveryMode")}</p>
            <h2 className="detail-title">{cardData?.title || "PaperDeck"}</h2>
            <p className="detail-subtitle">{authorLine}</p>
          </div>
          <div className="detail-header-actions">
            <div className="app-segmented flex items-center gap-1 rounded-xl p-1">
              <button
                onClick={() => setCurrentMode("research")}
                className={`app-segment-button rounded-lg px-3 py-1.5 text-xs font-medium ${currentMode === "research" ? "is-active" : ""}`}
              >
                {t("card.researchMode")}
              </button>
              <button
                onClick={() => setCurrentMode("discovery")}
                className={`app-segment-button rounded-lg px-3 py-1.5 text-xs font-medium ${currentMode === "discovery" ? "is-active" : ""}`}
              >
                {t("card.discoveryMode")}
              </button>
            </div>
            <button onClick={onClose} className="app-outline-button rounded-xl px-4 py-2 text-sm font-medium">
              {t("common.close")}
            </button>
          </div>
        </div>

        <div className="detail-grid">
          <div className="detail-card-rail">
            <PaperCard
              card={
                isLoadingMode && !cardData?.card_content
                  ? { ...cardData, mode: currentMode, card_content: null }
                  : { ...cardData, mode: currentMode }
              }
              mode={currentMode}
            />
            <div className="detail-rail-panel">
              <div className="detail-meta-grid">
                <MetaPill label={t("card.citations")} value={cardData?.citation_count || 0} />
                <MetaPill label={ui.venue} value={cardData?.venue || "N/A"} />
                <MetaPill label={ui.year} value={cardData?.year || "N/A"} />
                <MetaPill label={ui.zone} value={cardData?.zone || cardData?.tier || "N/A"} />
              </div>
              <div className="detail-rail-actions">
                <button
                  onClick={handleCollect}
                  className={`app-accent-button rounded-xl px-4 py-3 text-sm font-semibold ${collected ? "opacity-80" : ""}`}
                >
                  {collected ? t("card.collected") : t("card.collect")}
                </button>
                {cardData?.doi || cardData?.url ? (
                  <a
                    href={cardData?.doi ? `https://doi.org/${cardData.doi}` : cardData.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="app-outline-button rounded-xl px-4 py-3 text-sm font-medium text-center"
                  >
                    DOI
                  </a>
                ) : null}
              </div>
            </div>
          </div>

          <div className="detail-reading-surface">
            <div className="detail-reading-header">
              <div>
                <p className="detail-kicker">{currentMode === "research" ? ui.readingEyebrow : ui.quickEyebrow}</p>
                <h3 className="detail-reading-title">{currentMode === "research" ? ui.readingTitle : ui.quickTitle}</h3>
                {modeError && <p className="detail-reading-note">{modeError}</p>}
                {!cachedCard?.card_content && !isLoadingMode && modeError && (
                  <p className="detail-reading-note">{ui.fallbackNotice}</p>
                )}
              </div>
            </div>
            {isLoadingMode && !cardData?.card_content ? (
              <div className="detail-loading">{t("common.loading")}</div>
            ) : (
              <ReadingPanel card={cardData} mode={currentMode} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
