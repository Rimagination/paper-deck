import { useEffect, useState } from "react";
import { useScanSciAuth } from "../../auth";
import { useLanguage } from "../../i18n";
import { generateCard } from "../../api/backend";
import PaperCard from "./PaperCard";

export default function CardDetail({ card, mode, onClose }) {
  const { t, locale } = useLanguage();
  const { isFavorite, toggleFavorite } = useScanSciAuth();
  const [currentMode, setCurrentMode] = useState(mode);
  const [cardData, setCardData] = useState(card);
  const [isLoadingMode, setIsLoadingMode] = useState(false);

  const collected = isFavorite(cardData);

  useEffect(() => {
    setCurrentMode(mode);
    setCardData(card);
  }, [card, mode]);

  useEffect(() => {
    let cancelled = false;

    async function ensureCardContent() {
      if (!cardData?.paper_id) return;
      if (cardData.card_content && cardData.mode === currentMode && cardData.language === locale) return;

      setIsLoadingMode(true);
      try {
        const nextCard = await generateCard(cardData.paper_id, currentMode, locale);
        if (!cancelled) {
          setCardData(nextCard);
        }
      } catch (error) {
        console.error("Failed to generate card:", error);
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
  }, [cardData?.card_content, cardData?.language, cardData?.mode, cardData?.paper_id, currentMode, locale]);

  function handleModeSwitch(newMode) {
    if (newMode === currentMode) return;
    setCurrentMode(newMode);
  }

  async function handleCollect() {
    await toggleFavorite(cardData, cardData.zone || cardData.tier, currentMode);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-4 w-full max-w-lg animate-fade-in" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-center gap-2">
          <button
            onClick={() => handleModeSwitch("research")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              currentMode === "research" ? "bg-white text-slate-900 shadow-md" : "text-white/80 hover:text-white"
            }`}
          >
            {t("card.researchMode")}
          </button>
          <button
            onClick={() => handleModeSwitch("discovery")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              currentMode === "discovery" ? "bg-white text-slate-900 shadow-md" : "text-white/80 hover:text-white"
            }`}
          >
            {t("card.discoveryMode")}
          </button>
        </div>

        {isLoadingMode ? (
          <PaperCard card={{ ...cardData, mode: currentMode, card_content: null }} mode={currentMode} />
        ) : (
          <PaperCard card={cardData} mode={currentMode} />
        )}

        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            onClick={handleCollect}
            className={`rounded-xl px-6 py-2.5 text-sm font-semibold transition-all ${
              collected ? "bg-emerald-500 text-white" : "bg-white text-slate-900 hover:bg-emerald-50"
            }`}
          >
            {collected ? t("card.collected") : t("card.collect")}
          </button>
          <button
            onClick={onClose}
            className="rounded-xl bg-white/80 px-6 py-2.5 text-sm font-medium text-slate-600 hover:bg-white"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
