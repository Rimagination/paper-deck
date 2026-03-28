import { useEffect, useMemo, useState } from "react";
import { useScanSciAuth } from "../../auth";
import { useLanguage } from "../../i18n";
import { useTheme } from "../../theme";
import PaperCard from "../cards/PaperCard";
import TierBadge, { getTierConfig } from "../cards/TierBadge";

function CardBack({ zone, tier, modeLabel }) {
  const { t } = useLanguage();
  const theme = getTierConfig(zone || tier);

  return (
    <div className={`gacha-card-back ${theme.cardClass}`}>
      <div className="gacha-card-back-grid" />
      <div className="gacha-card-back-foil" />
      <div className="relative z-[1] flex h-full w-full flex-col justify-between p-6">
        <div className="flex items-start justify-between gap-3">
          <TierBadge zone={zone} tier={tier} />
          <span className={`text-[10px] font-semibold uppercase tracking-[0.26em] ${theme.authorColor}`}>
            {modeLabel}
          </span>
        </div>

        <div className="space-y-4 text-center">
          <div className={`gacha-card-back-sigil ${theme.tagClass}`}>
            <div className="gacha-card-back-sigil-core" />
          </div>
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.36em] ${theme.authorColor}`}>PaperDeck</p>
            <p className={`mt-3 text-sm font-semibold ${theme.bodyColor}`}>{t("gacha.tapToReveal")}</p>
          </div>
        </div>

        <div className="flex items-end justify-between">
          <div className={`deck-preview-orb ${theme.loaderCoreClass}`} />
          <div className={`text-[10px] font-medium ${theme.authorColor}`}>{t("draw.previewEyebrow")}</div>
        </div>
      </div>
    </div>
  );
}

function RemainingStack({ cards, currentIndex, cardMode }) {
  const { t } = useLanguage();
  const modeLabel = cardMode === "research" ? t("card.researchMode") : t("card.discoveryMode");
  const previewCards = cards.slice(currentIndex + 1, currentIndex + 4);
  const remainingCount = Math.max(cards.length - currentIndex - 1, 0);

  return (
    <div className="gacha-side-stack">
      <p className="gacha-side-label">{t("draw.previewEyebrow")}</p>
      <div className="gacha-side-stack-shell">
        {previewCards.length > 0 ? (
          previewCards.map((card, index) => {
            const theme = getTierConfig(card.zone || card.tier);
            return (
              <div
                key={`${card.paper_id}-${index}`}
                className="gacha-side-stack-card"
                style={{ "--stack-index": index }}
              >
                <div className={`gacha-side-stack-surface ${theme.cardClass}`}>
                  <div className="gacha-side-stack-grid" />
                  <span className={`gacha-side-stack-mode ${theme.authorColor}`}>{modeLabel}</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="gacha-side-stack-empty">0</div>
        )}
      </div>
      <p className="mt-4 text-xs text-white/55">
        {modeLabel} / {remainingCount}
      </p>
    </div>
  );
}

export default function GachaDraw({ cards, cardMode, onClose }) {
  const { t } = useLanguage();
  const { theme: appTheme } = useTheme();
  const { toggleFavorite } = useScanSciAuth();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState({});
  const [collected, setCollected] = useState(new Set());
  const [cardMotion, setCardMotion] = useState({ tiltX: 0, tiltY: 0, glowX: 50, glowY: 50 });

  useEffect(() => {
    setCardMotion({ tiltX: 0, tiltY: 0, glowX: 50, glowY: 50 });
  }, [currentIndex]);

  if (!Array.isArray(cards) || cards.length === 0) {
    return null;
  }

  const currentCard = cards[currentIndex];
  const isFlipped = flipped[currentIndex];
  const isCollected = collected.has(currentIndex);
  const isLast = currentIndex >= cards.length - 1;
  const modeLabel = cardMode === "research" ? t("card.researchMode") : t("card.discoveryMode");
  const currentTheme = getTierConfig(currentCard.zone || currentCard.tier);
  const authorLine = (currentCard.authors || []).slice(0, 2).join(", ");
  const metaLine = [authorLine, currentCard.venue, currentCard.year].filter(Boolean).join(" / ");
  const progress = ((currentIndex + (isFlipped ? 1 : 0)) / cards.length) * 100;
  const cardStyle = {
    "--gacha-tilt-x": `${cardMotion.tiltX}deg`,
    "--gacha-tilt-y": `${cardMotion.tiltY}deg`,
    "--gacha-glow-x": `${cardMotion.glowX}%`,
    "--gacha-glow-y": `${cardMotion.glowY}%`,
  };

  function handleFlip() {
    if (!isFlipped) {
      setFlipped((prev) => ({ ...prev, [currentIndex]: true }));
    }
  }

  function handleCardMove(event) {
    if (isFlipped) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    setCardMotion({
      tiltX: (0.5 - y) * 12,
      tiltY: (x - 0.5) * 14,
      glowX: x * 100,
      glowY: y * 100,
    });
  }

  function resetCardMotion() {
    setCardMotion({ tiltX: 0, tiltY: 0, glowX: 50, glowY: 50 });
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

  const metadata = useMemo(
    () => [
      { label: t("draw.deckMode"), value: modeLabel },
      { label: t("draw.deckCollectedCount"), value: collected.size },
      { label: t("card.citations"), value: currentCard.citation_count || 0 },
    ],
    [collected.size, currentCard.citation_count, modeLabel, t]
  );

  return (
    <div className={`gacha-overlay ${appTheme === "dark" ? "is-dark" : "is-light"}`}>
      <div className="gacha-overlay-noise" />
      <div className="gacha-overlay-glow gacha-overlay-glow-a" />
      <div className="gacha-overlay-glow gacha-overlay-glow-b" />

      <div className="gacha-shell">
        <header className="gacha-shell-header">
          <div>
            <p className="gacha-shell-kicker">{t("draw.eyebrow")}</p>
            <h2 className="font-heading text-2xl font-semibold text-white">{t("gacha.title")}</h2>
          </div>
          <div className="gacha-shell-progress">
            <span>
              {currentIndex + 1} / {cards.length}
            </span>
            <div className="gacha-shell-progress-track">
              <div className="gacha-shell-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </header>

        <div className="gacha-shell-grid">
          <RemainingStack cards={cards} currentIndex={currentIndex} cardMode={cardMode} />

          <div className="gacha-stage">
            <div className="gacha-stage-ring gacha-stage-ring-a" />
            <div className="gacha-stage-ring gacha-stage-ring-b" />
            <div className="gacha-stage-pedestal" />

            <div className="gacha-stage-topline">
              <TierBadge zone={currentCard.zone} tier={currentCard.tier} />
              {currentCard.similarity_score > 0 && (
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${currentTheme.matchClass}`}>
                  {Math.round(currentCard.similarity_score * 100)}% {t("recommend.matchScore")}
                </span>
              )}
            </div>

            <div
              className="gacha-card-stage perspective-1000"
              onClick={handleFlip}
              onMouseMove={handleCardMove}
              onMouseLeave={resetCardMotion}
            >
              <div
                className={`preserve-3d gacha-card-rotator ${isFlipped ? "is-flipped" : ""}`}
                style={cardStyle}
              >
                <div className="backface-hidden absolute inset-0 cursor-pointer">
                  <div className="gacha-card-face gacha-card-face-back">
                    <CardBack zone={currentCard.zone} tier={currentCard.tier} modeLabel={modeLabel} />
                  </div>
                </div>

                <div className="backface-hidden rotate-y-180 absolute inset-0">
                  <div className="gacha-card-face gacha-card-face-front overflow-y-auto">
                    <PaperCard card={currentCard} mode={cardMode} />
                  </div>
                </div>
              </div>
            </div>

            <div className="gacha-stage-caption">
              <p className="gacha-shell-kicker">{isFlipped ? currentCard.title : t("gacha.tapToReveal")}</p>
              <p className="mt-2 text-sm leading-6 text-white/65">{isFlipped ? metaLine || modeLabel : modeLabel}</p>
            </div>
          </div>

          <aside className="gacha-inspector">
            <div className="gacha-inspector-panel">
              <p className="gacha-shell-kicker">{t("draw.memorySource")}</p>
              <div className="mt-4 space-y-3">
                {metadata.map((item) => (
                  <div key={item.label} className="gacha-inspector-row">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="gacha-inspector-panel">
              <p className="gacha-shell-kicker">{t("draw.filterEyebrow")}</p>
              <p className="mt-3 text-sm leading-7 text-white/68">
                {isCollected ? t("card.collected") : t("draw.filterBody", { count: collected.size })}
              </p>
            </div>
          </aside>
        </div>

        <div className="gacha-actions">
          <div className="gacha-actions-group">
            <button
              onClick={handleCollect}
              disabled={!isFlipped || isCollected}
              className={`gacha-action-button is-primary ${!isFlipped || isCollected ? "is-disabled" : ""}`}
            >
              {isCollected ? t("card.collected") : t("card.collect")}
            </button>
            <button
              onClick={handleSkip}
              className={`gacha-action-button ${!isFlipped ? "is-disabled" : ""}`}
              disabled={!isFlipped}
            >
              {t("card.skip")}
            </button>
            <button
              onClick={handleNext}
              className={`gacha-action-button is-accent ${!isFlipped ? "is-disabled" : ""}`}
              disabled={!isFlipped}
            >
              {isLast ? t("gacha.done") : t("gacha.nextCard")}
            </button>
          </div>

          <div className="gacha-secondary-actions">
            {cards.length > 1 && (
              <button onClick={handleCollectAll} className="gacha-text-button">
                {t("gacha.collectAll")}
              </button>
            )}
            <button onClick={onClose} className="gacha-text-button">
              {t("common.close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
