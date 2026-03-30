import { useEffect, useMemo, useRef, useState } from "react";
import { useScanSciAuth } from "../../auth";
import { gachaDraw } from "../../api/backend";
import { useLanguage } from "../../i18n";
import { markCardRead } from "../../readingState";
import { useTheme } from "../../theme";
import { getTierConfig } from "../cards/TierBadge";
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

function EmptyState({ title, body, actionLabel, onAction, secondaryActionLabel, onSecondaryAction }) {
  return (
    <section className="paper-surface flex min-h-[360px] flex-col items-center justify-center rounded-[30px] px-6 py-14 text-center">
      <div className="max-w-lg">
        <h2 className="font-heading-cn text-3xl font-semibold" style={{ color: "var(--text-main)" }}>
          {title}
        </h2>
        <p className="mt-3 text-sm leading-7" style={{ color: "var(--text-muted)" }}>
          {body}
        </p>
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button onClick={onAction} className="app-primary-button rounded-2xl px-5 py-3 text-sm font-medium">
          {actionLabel}
        </button>
        {secondaryActionLabel && onSecondaryAction ? (
          <button onClick={onSecondaryAction} className="app-outline-button rounded-2xl px-5 py-3 text-sm font-medium">
            {secondaryActionLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export default function DrawView({ profileReady, seedPaperIds, cardMode, onOpenDiscover, onViewCard }) {
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
          discoverLabel: "Discover",
          emptyTitle: "Nothing to draw yet",
          emptyBody: "Generate your interest memory in Discover first. The draw deck is built directly from that memory.",
          emptyAction: "Go to Discover",
          loadingTitle: "Casting the next card",
          loadingPhrases: [
            "Research memory is condensing into the next card.",
            "Keywords are tracing the next sigil.",
            "Citations are feeding the next summon.",
            "Signals from your seed papers are stabilizing the deck.",
          ],
          retryAction: "Try again",
          errorTitle: "The summon faltered",
          errorBody: "Your interest memory is still here, but the next card did not resolve successfully. Try summoning again.",
          exhaustedTitle: "The current deck has gone quiet",
          exhaustedBody: "No new cards are surfacing from the current memory. Add more seeds or rebuild the interest memory to continue.",
        }
      : {
          readingLayer: "\u7814\u7a76\u9605\u8bfb",
          quickRead: "\u5feb\u901f\u901f\u89c8",
          readingBody: "\u7ffb\u724c\u51b3\u5b9a\u4e0b\u4e00\u6b65\u770b\u4ec0\u4e48\uff0c\u8fd9\u91cc\u627f\u63a5\u7ed3\u6784\u5316\u7684\u7814\u7a76\u89e3\u8bfb\u3002",
          quickBody: "\u5148\u7528\u901f\u89c8\u5224\u65ad\u8fd9\u7bc7\u8bba\u6587\u662f\u5426\u503c\u5f97\u7ee7\u7eed\u7ec6\u8bfb\u3002",
          discoverLabel: "\u53d1\u73b0",
          emptyTitle: "\u73b0\u5728\u8fd8\u6ca1\u6709\u53ef\u62bd\u7684\u724c\u7ec4",
          emptyBody: "\u5148\u5728\u53d1\u73b0\u9875\u641c\u8bba\u6587\u5e76\u751f\u6210\u5174\u8da3\u8bb0\u5fc6\uff0c\u62bd\u5361\u9875\u624d\u4f1a\u4ece\u8fd9\u4efd\u8bb0\u5fc6\u91cc\u7ee7\u7eed\u53ec\u724c\u3002",
          emptyAction: "\u53bb\u53d1\u73b0",
          loadingTitle: "\u9b54\u6cd5\u53ec\u724c\u4e2d",
          loadingPhrases: [
            "\u7814\u7a76\u8bb0\u5fc6\u6b63\u6cbf\u7740\u8bcd\u4e0e\u5f15\u6587\u7f13\u7f13\u805a\u6210\u4e0b\u4e00\u5f20\u724c",
            "\u5173\u952e\u8bcd\u6b63\u5728\u7f16\u7ec7\u4e0b\u4e00\u9053\u724c\u9762\u7eb9\u8def",
            "\u79cd\u5b50\u8bba\u6587\u7684\u4fe1\u53f7\u6b63\u5728\u7ed9\u65b0\u5361\u6ce8\u5165\u5f62\u72b6",
            "\u5f15\u6587\u4e0e\u4e3b\u9898\u6b63\u5728\u4e3a\u4e0b\u4e00\u6b21\u53ec\u724c\u79ef\u84c4\u80fd\u91cf",
          ],
          retryAction: "\u91cd\u65b0\u53ec\u724c",
          errorTitle: "\u53ec\u724c\u6682\u65f6\u5931\u8d25\u4e86",
          errorBody: "\u4f60\u7684\u5174\u8da3\u8bb0\u5fc6\u4ecd\u7136\u5b58\u5728\uff0c\u53ea\u662f\u8fd9\u6b21\u65b0\u724c\u6ca1\u6709\u987a\u5229\u51dd\u6210\u3002\u53ef\u4ee5\u76f4\u63a5\u91cd\u65b0\u53ec\u724c\u3002",
          exhaustedTitle: "\u5f53\u524d\u724c\u7ec4\u6682\u65f6\u5b89\u9759\u4e0b\u6765\u4e86",
          exhaustedBody: "\u73b0\u6709\u5174\u8da3\u8bb0\u5fc6\u91cc\u6ca1\u6709\u66f4\u591a\u65b0\u724c\u6d6e\u73b0\u3002\u53ef\u4ee5\u518d\u52a0\u51e0\u7bc7\u79cd\u5b50\u8bba\u6587\uff0c\u6216\u91cd\u65b0\u751f\u6210\u4e00\u6b21\u5174\u8da3\u8bb0\u5fc6\u3002",
        };

  const [cards, setCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState({});
  const [collected, setCollected] = useState(new Set());
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [drawStatus, setDrawStatus] = useState("idle");
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);
  const [cardMotion, setCardMotion] = useState({ tiltX: 0, tiltY: 0, glowX: 50, glowY: 50 });
  const [settled, setSettled] = useState({});
  const [stageMotion, setStageMotion] = useState({ x: 0, y: 0 });
  const [flipFlashActive, setFlipFlashActive] = useState(false);

  const isDark = appTheme === "dark";
  const seenIds = useRef(new Set());
  const flipFlashTimeoutRef = useRef(null);

  async function fetchMore() {
    if (isFetching || !profileReady || seedPaperIds.length === 0) return;

    const hadCards = cards.length > 0;
    setIsFetching(true);
    setFetchError("");
    if (!hadCards) {
      setDrawStatus("loading");
    }

    try {
      const excluded = [...new Set([...getCollectedPaperIds(), ...seenIds.current])];
      const result = await gachaDraw(seedPaperIds, 5, cardMode, locale, excluded);
      const nextCards = Array.isArray(result.cards) ? result.cards : [];

      if (nextCards.length > 0) {
        nextCards.forEach((card) => seenIds.current.add(card.paper_id));
        setCards((prev) => [...prev, ...nextCards]);
        setDrawStatus("ready");
        return;
      }

      seenIds.current = new Set(getCollectedPaperIds());
      const retry = await gachaDraw(seedPaperIds, 5, cardMode, locale, [...seenIds.current]);
      const retryCards = Array.isArray(retry.cards) ? retry.cards : [];

      if (retryCards.length > 0) {
        retryCards.forEach((card) => seenIds.current.add(card.paper_id));
        setCards((prev) => [...prev, ...retryCards]);
        setDrawStatus("ready");
        return;
      }

      setFetchError(t("draw.emptyPool"));
      setDrawStatus(hadCards ? "ready" : "empty");
    } catch {
      setFetchError(t("draw.error"));
      setDrawStatus(hadCards ? "ready" : "error");
    } finally {
      setIsFetching(false);
    }
  }

  useEffect(() => {
    seenIds.current = new Set(getCollectedPaperIds());
    setCards([]);
    setCurrentIndex(0);
    setFlipped({});
    setCollected(new Set());
    setFetchError("");
    setDrawStatus("idle");
    setLoadingPhraseIndex(0);
    setSettled({});
    setCardMotion({ tiltX: 0, tiltY: 0, glowX: 50, glowY: 50 });
    setStageMotion({ x: 0, y: 0 });
    setFlipFlashActive(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileReady, seedPaperIds.join(","), cardMode]);

  useEffect(() => {
    if (profileReady && seedPaperIds.length > 0) {
      fetchMore();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileReady, seedPaperIds.join(","), cardMode]);

  useEffect(() => {
    const remaining = cards.length - currentIndex - 1;
    if (
      profileReady &&
      seedPaperIds.length > 0 &&
      cards.length > 0 &&
      currentIndex < cards.length &&
      remaining <= 1 &&
      !isFetching &&
      drawStatus === "ready"
    ) {
      fetchMore();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, cards.length, isFetching, drawStatus]);

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

  useEffect(() => {
    if (drawStatus !== "loading") {
      setLoadingPhraseIndex(0);
      return undefined;
    }

    const intervalId = setInterval(() => {
      setLoadingPhraseIndex((current) => (current + 1) % ui.loadingPhrases.length);
    }, 1800);

    return () => clearInterval(intervalId);
  }, [drawStatus, ui.loadingPhrases]);

  if (!profileReady || seedPaperIds.length === 0) {
    return (
      <EmptyState
        title={ui.emptyTitle}
        body={ui.emptyBody}
        actionLabel={ui.emptyAction}
        onAction={onOpenDiscover}
      />
    );
  }

  const currentCard = cards[currentIndex] || null;
  const isFlipped = !!flipped[currentIndex];
  const isCollected = collected.has(currentIndex);
  const modeLabel = cardMode === "research" ? t("card.researchMode") : t("card.discoveryMode");
  const loadingSubtitle = ui.loadingPhrases[loadingPhraseIndex];
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
      setTimeout(() => {
        setSettled((prev) => ({ ...prev, [currentIndex]: true }));
      }, 780);
    }
  }

  function handleCardMove(event) {
    if (isFlipped) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
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
    [collected.size, currentCard, modeLabel, t]
  );

  if (drawStatus === "loading" && cards.length === 0) {
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
        {!isDark ? (
          <>
            <div className="draw-glow-orb draw-glow-orb-a" />
            <div className="draw-glow-orb draw-glow-orb-b" />
            <div className="draw-glow-orb draw-glow-orb-c" />
          </>
        ) : null}
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
              {ui.loadingTitle}
            </h3>
            <p className="draw-loading-subtitle">{loadingSubtitle}</p>
            <div className="draw-loading-runeline" aria-hidden="true">
              <span />
              <span />
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

  if ((drawStatus === "empty" || drawStatus === "error") && cards.length === 0) {
    return (
      <EmptyState
        title={drawStatus === "empty" ? ui.exhaustedTitle : ui.errorTitle}
        body={fetchError || (drawStatus === "empty" ? ui.exhaustedBody : ui.errorBody)}
        actionLabel={drawStatus === "empty" ? ui.emptyAction : ui.retryAction}
        onAction={drawStatus === "empty" ? onOpenDiscover : fetchMore}
        secondaryActionLabel={drawStatus === "empty" ? null : ui.discoverLabel}
        onSecondaryAction={drawStatus === "empty" ? null : onOpenDiscover}
      />
    );
  }

  if (currentIndex >= cards.length && cards.length > 0) {
    return (
      <EmptyState
        title={ui.exhaustedTitle}
        body={fetchError || ui.exhaustedBody}
        actionLabel={ui.discoverLabel}
        onAction={onOpenDiscover}
      />
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
      {!isDark ? (
        <>
          <div className="draw-glow-orb draw-glow-orb-a" />
          <div className="draw-glow-orb draw-glow-orb-b" />
          <div className="draw-glow-orb draw-glow-orb-c" />
        </>
      ) : null}

      <div className={`gacha-shell ${isDark ? "is-dark" : "is-light"}`}>
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

        <div className="draw-stage-grid">
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
              onKeyDown={(event) => {
                if (event.key === "Enter") handleFlip();
              }}
              aria-label={t("gacha.tapToReveal")}
            >
              {currentCard && !showScrollCard ? (
                <div className={`preserve-3d gacha-card-rotator ${isFlipped ? "is-flipped" : ""}`} style={cardStyle}>
                  <div className="backface-hidden absolute inset-0 cursor-pointer">
                    <div className="gacha-card-face gacha-card-face-back">
                      <CardBack zone={currentCard.zone} tier={currentCard.tier} modeLabel={modeLabel} />
                    </div>
                  </div>
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
              <p className="gacha-shell-kicker">{isFlipped && currentCard ? "" : t("gacha.tapToReveal")}</p>
              <p className="draw-stage-meta">{isFlipped && currentCard ? "" : modeLabel}</p>
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

            {isFlipped && currentCard ? (
              <div className="gacha-inspector-panel gacha-inspector-reading">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="gacha-shell-kicker">{cardMode === "research" ? ui.readingLayer : ui.quickRead}</p>
                    <p className="draw-inspector-body">{cardMode === "research" ? ui.readingBody : ui.quickBody}</p>
                  </div>
                  {onViewCard ? (
                    <button
                      onClick={() => onViewCard(currentCard)}
                      className="app-outline-button rounded-xl px-3 py-2 text-xs font-medium"
                    >
                      {t("recommend.viewCard")}
                    </button>
                  ) : null}
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

            {isFetching ? (
              <div className="draw-fetch-row">
                <div className="draw-fetch-dot" />
                <span>{t("draw.drawing")}</span>
              </div>
            ) : null}
            {fetchError ? <p className="draw-fetch-error">{fetchError}</p> : null}
          </aside>
        </div>

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
            {isFlipped && currentCard && onViewCard ? (
              <button onClick={() => onViewCard(currentCard)} className="gacha-action-button">
                {t("recommend.viewCard")}
              </button>
            ) : null}
          </div>
          <div className="gacha-secondary-actions">
            <button onClick={onOpenDiscover} className="gacha-text-button">
              {ui.discoverLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
