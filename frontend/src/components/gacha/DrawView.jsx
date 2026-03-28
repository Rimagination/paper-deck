import { useEffect, useMemo, useRef, useState } from "react";
import { useScanSciAuth } from "../../auth";
import { gachaDraw } from "../../api/backend";
import { useLanguage } from "../../i18n";
import { useTheme } from "../../theme";
import TierBadge, { getTierConfig } from "../cards/TierBadge";
import PaperCard from "../cards/PaperCard";

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
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, body, actionLabel, onAction }) {
  return (
    <section className="paper-surface flex min-h-[360px] flex-col items-center justify-center rounded-[30px] px-6 py-14 text-center">
      <div className="max-w-lg">
        <h2 className="font-heading text-3xl font-semibold" style={{ color: "var(--text-main)" }}>{title}</h2>
        <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>{body}</p>
      </div>
      <button onClick={onAction} className="app-primary-button mt-8 rounded-2xl px-5 py-3 text-sm font-medium">
        {actionLabel}
      </button>
    </section>
  );
}

export default function DrawView({ profileInfo, profileReady, seedPaperIds, cardMode, onOpenDiscover }) {
  const { t, locale } = useLanguage();
  const { theme: appTheme } = useTheme();
  const { getCollectedPaperIds, toggleFavorite } = useScanSciAuth();

  const [cards, setCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState({});
  const [collected, setCollected] = useState(new Set());
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [cardMotion, setCardMotion] = useState({ tiltX: 0, tiltY: 0, glowX: 50, glowY: 50 });

  const isDark = appTheme === "dark";
  const seenIds = useRef(new Set());

  async function fetchMore() {
    if (isFetching || !profileReady || seedPaperIds.length === 0) return;
    setIsFetching(true);
    setFetchError("");
    try {
      const excluded = [...new Set([...getCollectedPaperIds(), ...seenIds.current])];
      const result = await gachaDraw(seedPaperIds, 5, cardMode, locale, excluded);
      if (Array.isArray(result.cards) && result.cards.length > 0) {
        result.cards.forEach((c) => seenIds.current.add(c.paper_id));
        setCards((prev) => [...prev, ...result.cards]);
      } else {
        // pool exhausted – reset seen set and retry with only collected excluded
        seenIds.current = new Set(getCollectedPaperIds());
        const retry = await gachaDraw(seedPaperIds, 5, cardMode, locale, [...seenIds.current]);
        if (Array.isArray(retry.cards) && retry.cards.length > 0) {
          retry.cards.forEach((c) => seenIds.current.add(c.paper_id));
          setCards((prev) => [...prev, ...retry.cards]);
        }
      }
    } catch {
      setFetchError(t("draw.error"));
    }
    setIsFetching(false);
  }

  // initial fetch
  useEffect(() => {
    if (profileReady && seedPaperIds.length > 0) fetchMore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileReady, seedPaperIds.join(","), cardMode]);

  // pre-fetch when running low
  useEffect(() => {
    const remaining = cards.length - currentIndex - 1;
    if (profileReady && seedPaperIds.length > 0 && remaining <= 1 && !isFetching) {
      fetchMore();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, cards.length, isFetching]);

  // reset tilt on card change
  useEffect(() => {
    setCardMotion({ tiltX: 0, tiltY: 0, glowX: 50, glowY: 50 });
  }, [currentIndex]);

  if (!profileReady || seedPaperIds.length === 0) {
    return (
      <EmptyState
        title={t("draw.emptyTitle")}
        body={t("draw.emptyBody")}
        actionLabel={t("draw.openDiscover")}
        onAction={onOpenDiscover}
      />
    );
  }

  const currentCard = cards[currentIndex];
  const isFlipped = !!flipped[currentIndex];
  const isCollected = collected.has(currentIndex);
  const modeLabel = cardMode === "research" ? t("card.researchMode") : t("card.discoveryMode");
  const currentTheme = currentCard ? getTierConfig(currentCard.zone || currentCard.tier) : null;
  const authorLine = currentCard ? (currentCard.authors || []).slice(0, 2).join(", ") : "";
  const metaLine = currentCard ? [authorLine, currentCard.venue, currentCard.year].filter(Boolean).join(" / ") : "";

  const cardStyle = {
    "--gacha-tilt-x": `${cardMotion.tiltX}deg`,
    "--gacha-tilt-y": `${cardMotion.tiltY}deg`,
    "--gacha-glow-x": `${cardMotion.glowX}%`,
    "--gacha-glow-y": `${cardMotion.glowY}%`,
  };

  function handleFlip() {
    if (!isFlipped && currentCard) {
      setFlipped((prev) => ({ ...prev, [currentIndex]: true }));
    }
  }

  function handleCardMove(e) {
    if (isFlipped) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setCardMotion({ tiltX: (0.5 - y) * 12, tiltY: (x - 0.5) * 14, glowX: x * 100, glowY: y * 100 });
  }

  function resetCardMotion() {
    setCardMotion({ tiltX: 0, tiltY: 0, glowX: 50, glowY: 50 });
  }

  async function handleCollect() {
    if (!currentCard || !isFlipped || isCollected) return;
    await toggleFavorite(currentCard, currentCard.zone || currentCard.tier, cardMode);
    setCollected((prev) => new Set(prev).add(currentIndex));
  }

  function handleNext() {
    setCurrentIndex((prev) => prev + 1);
  }

  const metadata = useMemo(
    () => [
      { label: t("draw.deckMode"), value: modeLabel },
      { label: t("draw.deckCollectedCount"), value: collected.size },
      ...(currentCard ? [{ label: t("card.citations"), value: currentCard.citation_count || 0 }] : []),
    ],
    [collected.size, currentCard?.citation_count, modeLabel, t],
  );

  // loading: no cards yet
  if (cards.length === 0) {
    return (
      <div className={`gacha-stage-view ${isDark ? "is-dark" : "is-light"}`}>
        {!isDark && (
          <>
            <div className="draw-glow-orb draw-glow-orb-a" />
            <div className="draw-glow-orb draw-glow-orb-b" />
            <div className="draw-glow-orb draw-glow-orb-c" />
          </>
        )}
        <div className="draw-loading-center">
          <div className="draw-loading-spinner" />
          <p className="draw-loading-label">{t("draw.drawing")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`gacha-stage-view ${isDark ? "is-dark" : "is-light"}`}>
      {/* light-theme floating glow orbs */}
      {!isDark && (
        <>
          <div className="draw-glow-orb draw-glow-orb-a" />
          <div className="draw-glow-orb draw-glow-orb-b" />
          <div className="draw-glow-orb draw-glow-orb-c" />
        </>
      )}

      <div className={`gacha-shell ${isDark ? "is-dark" : "is-light"}`}>
        {/* header */}
        <header className="gacha-shell-header">
          <div>
            <p className="gacha-shell-kicker">{t("draw.eyebrow")}</p>
            <h2 className="font-heading text-2xl font-semibold">{t("gacha.title")}</h2>
          </div>
          <div className="gacha-shell-progress">
            <span className="draw-counter">
              {currentIndex + 1} <span className="draw-counter-inf">∞</span>
            </span>
            <div className="gacha-shell-progress-track">
              <div className="gacha-shell-progress-fill draw-progress-pulse" />
            </div>
          </div>
        </header>

        {/* 2-column: stage + inspector */}
        <div className="draw-stage-grid">
          {/* center card stage */}
          <div className="gacha-stage">
            <div className="gacha-stage-ring gacha-stage-ring-a" />
            <div className="gacha-stage-ring gacha-stage-ring-b" />
            <div className="gacha-stage-pedestal" />

            <div className="gacha-stage-topline">
              {currentCard && <TierBadge zone={currentCard.zone} tier={currentCard.tier} />}
              {currentCard?.similarity_score > 0 && currentTheme && (
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
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && handleFlip()}
              aria-label={t("gacha.tapToReveal")}
            >
              {currentCard ? (
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
              ) : (
                <div className="draw-card-placeholder">
                  <div className="draw-loading-spinner" />
                </div>
              )}
            </div>

            <div className="gacha-stage-caption">
              <p className="gacha-shell-kicker">
                {isFlipped && currentCard ? currentCard.title : t("gacha.tapToReveal")}
              </p>
              <p className="draw-stage-meta">
                {isFlipped && currentCard ? metaLine || modeLabel : modeLabel}
              </p>
            </div>
          </div>

          {/* right inspector */}
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
              <p className="draw-inspector-body">
                {isCollected ? t("card.collected") : t("draw.filterBody", { count: collected.size })}
              </p>
            </div>
            {isFetching && (
              <div className="draw-fetch-row">
                <div className="draw-fetch-dot" />
                <span>{t("draw.drawing")}</span>
              </div>
            )}
            {fetchError && <p className="draw-fetch-error">{fetchError}</p>}
          </aside>
        </div>

        {/* action bar */}
        <div className="gacha-actions">
          <div className="gacha-actions-group">
            <button
              onClick={handleCollect}
              disabled={!isFlipped || isCollected || !currentCard}
              className={`gacha-action-button is-primary ${!isFlipped || isCollected || !currentCard ? "is-disabled" : ""}`}
            >
              {isCollected ? t("card.collected") : t("card.collect")}
            </button>
            <button
              onClick={handleNext}
              disabled={!isFlipped || !currentCard}
              className={`gacha-action-button is-accent ${!isFlipped || !currentCard ? "is-disabled" : ""}`}
            >
              {t("gacha.nextCard")}
            </button>
          </div>
          <div className="gacha-secondary-actions">
            <button onClick={onOpenDiscover} className="gacha-text-button">
              {t("draw.backToDiscover")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
