import { useEffect, useMemo, useRef, useState } from "react";
import { useScanSciAuth } from "../../auth";
import { gachaDraw } from "../../api/backend";
import { useLanguage } from "../../i18n";
import { markCardRead } from "../../readingState";
import { useTheme } from "../../theme";
import TierBadge, { getTierConfig } from "../cards/TierBadge";
import PaperCard from "../cards/PaperCard";
import ReadingPanel from "../cards/ReadingPanel";

const ORBITAL_BODIES = [
  { size: "var(--draw-stage-orbit-1-size)", duration: "18s", delay: "-2s", direction: "normal", dotClass: "is-mercury" },
  { size: "var(--draw-stage-orbit-2-size)", duration: "24s", delay: "-7s", direction: "reverse", dotClass: "is-venus" },
  { size: "var(--draw-stage-orbit-2-size)", duration: "29s", delay: "-14s", direction: "normal", dotClass: "is-earth" },
  { size: "var(--draw-stage-orbit-3-size)", duration: "35s", delay: "-9s", direction: "normal", dotClass: "is-mars" },
  { size: "var(--draw-stage-orbit-4-size)", duration: "43s", delay: "-20s", direction: "reverse", dotClass: "is-jupiter" },
  { size: "var(--draw-stage-orbit-4-size)", duration: "51s", delay: "-31s", direction: "normal", dotClass: "is-saturn" },
  { size: "var(--draw-stage-orbit-5-size)", duration: "62s", delay: "-18s", direction: "reverse", dotClass: "is-uranus" },
  { size: "var(--draw-stage-orbit-5-size)", duration: "74s", delay: "-46s", direction: "normal", dotClass: "is-neptune" },
];

function CardBack({ zone, tier, modeLabel }) {
  const { t } = useLanguage();
  const theme = getTierConfig(zone || tier);
  return (
    <div className={`gacha-card-back ${theme.cardClass}`}>
      <div className="gacha-card-back-grid" />
      <div className="gacha-card-back-foil" />
      <div className="gacha-card-back-sheen" />
      <div className="relative z-[1] flex h-full w-full flex-col justify-between p-6">
        <div className="flex items-start justify-end gap-3">
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
        <h2 className="font-heading-cn text-3xl font-semibold" style={{ color: "var(--text-main)" }}>{title}</h2>
        <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>{body}</p>
      </div>
      <button onClick={onAction} className="app-primary-button mt-8 rounded-2xl px-5 py-3 text-sm font-medium">
        {actionLabel}
      </button>
    </section>
  );
}

export default function DrawView({ profileInfo, profileReady, seedPaperIds, cardMode, onOpenDiscover, onViewCard }) {
  const { t, locale } = useLanguage();
  const { theme: appTheme } = useTheme();
  const { getCollectedPaperIds, toggleFavorite } = useScanSciAuth();
  const ui =
    locale === "en"
      ? {
          readingLayer: "Reading Layer",
          quickRead: "Quick Read",
          readingBody: "Flip decides what to inspect next. The panel now holds the structured interpretation.",
          quickBody: "Use the quick brief to decide whether this paper deserves a deeper read.",
        }
      : {
          readingLayer: "阅读层",
          quickRead: "快速速览",
          readingBody: "翻牌决定下一步看什么，这里承接结构化研究解读。",
          quickBody: "先用速览判断这篇论文值不值得进一步细读。",
        };

  const [cards, setCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState({});
  const [collected, setCollected] = useState(new Set());
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [cardMotion, setCardMotion] = useState({ tiltX: 0, tiltY: 0, glowX: 50, glowY: 50 });
  const [settled, setSettled] = useState({});
  const [stageMotion, setStageMotion] = useState({ x: 0, y: 0 });
  const [flipFlashActive, setFlipFlashActive] = useState(false);

  const isDark = appTheme === "dark";
  const seenIds = useRef(new Set());
  const flipFlashTimeoutRef = useRef(null);

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

  useEffect(() => {
    return () => {
      if (flipFlashTimeoutRef.current) {
        clearTimeout(flipFlashTimeoutRef.current);
      }
    };
  }, []);

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
  const loadingTitle = locale === "zh" ? "星盘召牌中" : "Invoking the Deck";
  const loadingSubtitle = locale === "zh"
    ? "研究记忆正沿着词与引文缓缓聚成下一张牌"
    : "Research signals are condensing into the next card.";
  const authorLine = currentCard ? (currentCard.authors || []).slice(0, 2).join(", ") : "";
  const metaLine = currentCard ? [authorLine, currentCard.venue, currentCard.year].filter(Boolean).join(" / ") : "";

  const cardStyle = {
    "--gacha-tilt-x": `${cardMotion.tiltX}deg`,
    "--gacha-tilt-y": `${cardMotion.tiltY}deg`,
    "--gacha-glow-x": `${cardMotion.glowX}%`,
    "--gacha-glow-y": `${cardMotion.glowY}%`,
  };
  const stageStyle = {
    "--draw-parallax-x": `${stageMotion.x}px`,
    "--draw-parallax-y": `${stageMotion.y}px`,
  };

  const isSettled = !!settled[currentIndex];
  const showScrollCard = Boolean(isSettled && currentCard);

  function handleFlip() {
    if (!isFlipped && currentCard) {
      setFlipped((prev) => ({ ...prev, [currentIndex]: true }));
      markCardRead(currentCard.paper_id);
      setFlipFlashActive(false);
      if (flipFlashTimeoutRef.current) {
        clearTimeout(flipFlashTimeoutRef.current);
      }
      requestAnimationFrame(() => setFlipFlashActive(true));
      flipFlashTimeoutRef.current = setTimeout(() => setFlipFlashActive(false), 420);
      // After flip animation completes, flatten 3D so scroll is smooth
      setTimeout(() => {
        setSettled((prev) => ({ ...prev, [currentIndex]: true }));
      }, 780);
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

  function handleStageMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 22;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 18;
    setStageMotion({ x, y });
  }

  function resetStageMotion() {
    setStageMotion({ x: 0, y: 0 });
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
      <div
        className={`gacha-stage-view is-loading ${isDark ? "is-dark" : "is-light"}`}
        style={stageStyle}
        onMouseMove={handleStageMove}
        onMouseLeave={resetStageMotion}
      >
        <div className="draw-light-wheel draw-light-wheel-a" />
        <div className="draw-light-wheel draw-light-wheel-b" />
        <div className="draw-rotating-glow draw-rotating-glow-a" />
        <div className="draw-rotating-glow draw-rotating-glow-b" />
        <div className="draw-light-sweep draw-light-sweep-a" />
        <div className="draw-light-sweep draw-light-sweep-b" />
        <div className="draw-loading-haze draw-loading-haze-a" />
        <div className="draw-loading-haze draw-loading-haze-b" />
        <div className="draw-loading-haze draw-loading-haze-c" />
        <div className="draw-loading-veil draw-loading-veil-a" />
        <div className="draw-loading-veil draw-loading-veil-b" />
        <div className="draw-loading-veil draw-loading-veil-c" />
        <div className="draw-loading-starfield" aria-hidden="true" />
        {!isDark && (
          <>
            <div className="draw-glow-orb draw-glow-orb-a" />
            <div className="draw-glow-orb draw-glow-orb-b" />
            <div className="draw-glow-orb draw-glow-orb-c" />
          </>
        )}
        <div className="draw-loading-ritual" aria-live="polite">
          <div className="draw-loading-sigil" aria-hidden="true">
            <div className="draw-loading-sigil-ring draw-loading-sigil-ring-a" />
            <div className="draw-loading-sigil-ring draw-loading-sigil-ring-b" />
            <div className="draw-loading-sigil-ring draw-loading-sigil-ring-c" />
            <div className="draw-loading-sigil-core" />
          </div>
          <div className="draw-loading-copy">
            <p className="draw-loading-kicker">{`${t("draw.eyebrow")} / ${modeLabel}`}</p>
            <h3 className={`draw-loading-title ${locale === "zh" ? "font-heading-cn is-cn" : "font-heading"}`}>
              {loadingTitle}
            </h3>
            <p className="draw-loading-subtitle">{loadingSubtitle}</p>
            <div className="draw-loading-runeline" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`gacha-stage-view ${isDark ? "is-dark" : "is-light"}`}
      style={stageStyle}
      onMouseMove={handleStageMove}
      onMouseLeave={resetStageMotion}
    >
      <div className="draw-light-wheel draw-light-wheel-a" />
      <div className="draw-light-wheel draw-light-wheel-b" />
      <div className="draw-rotating-glow draw-rotating-glow-a" />
      <div className="draw-rotating-glow draw-rotating-glow-b" />
      <div className="draw-light-sweep draw-light-sweep-a" />
      <div className="draw-light-sweep draw-light-sweep-b" />
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
            <h2 className="font-heading-cn text-2xl font-semibold">{t("gacha.title")}</h2>
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
            <div className="gacha-stage-cosmos" aria-hidden="true">
              <div className="gacha-stage-aura gacha-stage-aura-a" />
              <div className="gacha-stage-aura gacha-stage-aura-b" />
              <div className="gacha-stage-core" />
              {ORBITAL_BODIES.map((body) => (
                <div
                  key={`${body.dotClass}-${body.size}`}
                  className="gacha-stage-orbit"
                  style={{
                    "--orbit-size": body.size,
                    animationDuration: body.duration,
                    animationDelay: body.delay,
                    animationDirection: body.direction,
                  }}
                >
                  <span className={`gacha-stage-orbit-dot ${body.dotClass}`} />
                </div>
              ))}
            </div>
            <div className="gacha-stage-ring gacha-stage-ring-a" />
            <div className="gacha-stage-ring gacha-stage-ring-b" />
            <div className="gacha-stage-pedestal" />

            <div
              className="gacha-card-stage perspective-1000"
              onClick={handleFlip}
              onMouseMove={showScrollCard ? undefined : handleCardMove}
              onMouseLeave={showScrollCard ? undefined : resetCardMotion}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && handleFlip()}
              aria-label={t("gacha.tapToReveal")}
            >
              {currentCard && !showScrollCard ? (
                <div
                  className={`preserve-3d gacha-card-rotator ${isFlipped ? "is-flipped" : ""}`}
                  style={cardStyle}
                >
                  {/* back face — hidden once settled to free GPU layers */}
                    <div className="backface-hidden absolute inset-0 cursor-pointer">
                      <div className="gacha-card-face gacha-card-face-back">
                        <CardBack zone={currentCard.zone} tier={currentCard.tier} modeLabel={modeLabel} />
                      </div>
                    </div>
                  {/* front face — becomes normal scrollable element once settled */}
                  <div className="backface-hidden rotate-y-180 absolute inset-0">
                    <div className="gacha-card-face gacha-card-face-front gacha-card-scroll">
                      <PaperCard card={currentCard} mode={cardMode} />
                    </div>
                  </div>
                </div>
              ) : null}
              {showScrollCard ? (
                <div className={`gacha-card-scroll-shell ${isCollected ? "is-collected" : ""}`}>
                  <div className="gacha-card-scroll-shell-inner">
                    <PaperCard card={currentCard} mode={cardMode} />
                  </div>
                </div>
              ) : null}
              {!currentCard ? (
                <div className="draw-card-placeholder">
                  <div className="draw-loading-spinner" />
                </div>
              ) : null}
              <div className={`draw-flip-flash ${flipFlashActive ? "is-active" : ""}`} aria-hidden="true" />
            </div>

            <div className="gacha-stage-caption">
              <p className="gacha-shell-kicker">
                {isFlipped && currentCard ? "" : t("gacha.tapToReveal")}
              </p>
              <p className="draw-stage-meta">
                {isFlipped && currentCard ? "" : modeLabel}
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
            {isFlipped && currentCard ? (
              <div className="gacha-inspector-panel gacha-inspector-reading">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="gacha-shell-kicker">{cardMode === "research" ? ui.readingLayer : ui.quickRead}</p>
                    <p className="draw-inspector-body">
                      {cardMode === "research"
                        ? ui.readingBody
                        : ui.quickBody}
                    </p>
                  </div>
                  {onViewCard && (
                    <button
                      onClick={() => onViewCard(currentCard)}
                      className="app-outline-button rounded-xl px-3 py-2 text-xs font-medium"
                    >
                      {t("recommend.viewCard")}
                    </button>
                  )}
                </div>
                <div className="mt-4">
                  <ReadingPanel card={currentCard} mode={cardMode} />
                </div>
              </div>
            ) : (
              <div className="gacha-inspector-panel">
                <p className="gacha-shell-kicker">{t("draw.filterEyebrow")}</p>
                <p className="draw-inspector-body">
                  {isCollected ? t("card.collected") : t("draw.filterBody", { count: collected.size })}
                </p>
              </div>
            )}
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
            {isFlipped && currentCard && onViewCard && (
              <button
                onClick={() => onViewCard(currentCard)}
                className="gacha-action-button"
              >
                {t("recommend.viewCard")}
              </button>
            )}
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
