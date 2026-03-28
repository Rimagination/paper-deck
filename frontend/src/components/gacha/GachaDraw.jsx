import { useState } from "react";
import { useScanSciAuth } from "../../auth";
import { useLanguage } from "../../i18n";
import PaperCard from "../cards/PaperCard";
import { getTierConfig } from "../cards/TierBadge";

function CardBack({ zone, tier }) {
  const { t } = useLanguage();
  const theme = getTierConfig(zone || tier);

  return (
    <div className={`flex h-full w-full items-center justify-center rounded-2xl ${theme.cardClass}`}>
      <div className="relative z-[1] text-center">
        <div className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border-2 ${theme.tagClass}`}>
          <span className="text-2xl font-black opacity-60">?</span>
        </div>
        <p className={`text-sm font-bold ${theme.authorColor}`}>{t("gacha.tapToReveal")}</p>
      </div>
    </div>
  );
}

export default function GachaDraw({ cards, cardMode, onClose }) {
  const { t } = useLanguage();
  const { toggleFavorite } = useScanSciAuth();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState({});
  const [collected, setCollected] = useState(new Set());

  if (!Array.isArray(cards) || cards.length === 0) {
    return null;
  }

  const currentCard = cards[currentIndex];
  const isFlipped = flipped[currentIndex];
  const isCollected = collected.has(currentIndex);
  const isLast = currentIndex >= cards.length - 1;

  function handleFlip() {
    if (!isFlipped) {
      setFlipped((prev) => ({ ...prev, [currentIndex]: true }));
    }
  }

  async function handleCollect() {
    await toggleFavorite(currentCard, currentCard.zone || currentCard.tier, cardMode);
    setCollected((prev) => new Set(prev).add(currentIndex));
  }

  function handleNext() {
    if (isLast) {
      onClose();
      return;
    }
    setCurrentIndex((prev) => prev + 1);
  }

  function handleSkip() {
    handleNext();
  }

  async function handleCollectAll() {
    for (let index = 0; index < cards.length; index += 1) {
      if (!collected.has(index)) {
        await toggleFavorite(cards[index], cards[index].zone || cards[index].tier, cardMode);
        setCollected((prev) => new Set(prev).add(index));
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md">
      <div className="mb-6 text-center">
        <h2 className="font-heading text-xl font-bold text-white">{t("gacha.title")}</h2>
        <p className="mt-1 text-sm text-white/60">
          {currentIndex + 1} / {cards.length}
        </p>
      </div>

      <div className="perspective-1000 h-[480px] w-[340px]" onClick={handleFlip}>
        <div
          className={`preserve-3d relative h-full w-full transition-transform duration-600 ${
            isFlipped ? "rotate-y-180" : ""
          }`}
          style={{ transitionDuration: "0.6s" }}
        >
          <div className="backface-hidden absolute inset-0 cursor-pointer">
            <CardBack zone={currentCard.zone} tier={currentCard.tier} />
            <p className="mt-3 text-center text-sm text-white/60">{t("gacha.tapToReveal")}</p>
          </div>

          <div className="backface-hidden rotate-y-180 absolute inset-0 overflow-y-auto">
            <PaperCard card={currentCard} mode={cardMode} />
          </div>
        </div>
      </div>

      {isFlipped && (
        <div className="mt-6 flex animate-fade-in items-center gap-3">
          <button
            onClick={handleCollect}
            disabled={isCollected}
            className={`rounded-xl px-6 py-2.5 text-sm font-semibold transition-all ${
              isCollected ? "bg-emerald-500 text-white" : "bg-white text-slate-900 hover:bg-emerald-50"
            }`}
          >
            {isCollected ? t("card.collected") : t("card.collect")}
          </button>
          <button
            onClick={handleSkip}
            className="rounded-xl bg-white/20 px-6 py-2.5 text-sm font-medium text-white hover:bg-white/30"
          >
            {t("card.skip")}
          </button>
          <button
            onClick={handleNext}
            className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            {isLast ? t("gacha.done") : t("gacha.nextCard")}
          </button>
        </div>
      )}

      <div className="mt-4 flex items-center gap-4">
        {cards.length > 1 && (
          <button onClick={handleCollectAll} className="text-xs text-white/50 hover:text-white/80">
            {t("gacha.collectAll")}
          </button>
        )}
        <button onClick={onClose} className="text-xs text-white/50 hover:text-white/80">
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}
