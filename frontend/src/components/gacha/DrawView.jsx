import { useEffect, useMemo, useRef, useState } from "react";
import { useScanSciAuth } from "../../auth";
import { gachaDraw } from "../../api/backend";
import { useLanguage } from "../../i18n";
import { markCardRead } from "../../readingState";
import { useTheme } from "../../theme";
import { getTierConfig } from "../cards/TierBadge";
import PaperCard from "../cards/PaperCard";

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

const DRAW_BATCH_SIZE = 1;
const MEMORY_LIMIT = 20;
const LOADING_PHRASE_DURATION_MS = 2600;
const LOADING_PHRASE_FADE_MS = 260;

function formatImpactFactor(value) {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) return null;
  const fixed = value.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

function CardBack({ zone, tier, modeLabel, isNi = false }) {
  const { t } = useLanguage();
  const theme = getTierConfig(zone || tier, { isNi });

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

function getGachaCards(result) {
  return Array.isArray(result?.cards) ? result.cards : [];
}

export default function DrawView({
  profileInfo,
  profileReady,
  seedPaperIds,
  cardMode,
  onOpenDiscover,
  onViewCard,
  onAddToMemory,
}) {
  const { t, locale } = useLanguage();
  const { theme: appTheme } = useTheme();
  const { getCollectedPaperIds, toggleFavorite } = useScanSciAuth();
  const ui =
    locale === "en"
      ? {
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
          actionEyebrow: "Actions",
          actionHintIdle: "Flip the card first. Then you can collect it, add it to memory, or open the full detail view.",
          actionHintReady: "Use the side rail to collect the card, merge it into memory, or open the full detail view.",
          addToMemory: "Add to Memory",
          alreadyInMemory: "Already in Memory",
          memoryCount: "Memory",
          memoryAdded: "The current paper has been added to your interest memory.",
          memoryAddedLocal: "Added to local memory. Sign in if you want it synced to ScanSci.",
          memoryDuplicate: "This paper is already part of your interest memory.",
          memoryFull: "Your interest memory is full. Go back to Discover and replace one of the existing seeds first.",
          memoryFailed: "Unable to add this paper to memory right now.",
        }
      : {
          discoverLabel: "发现",
          emptyTitle: "现在还没有可抽的牌组",
          emptyBody: "先在发现页搜论文并生成兴趣记忆，抽卡页才会从这份记忆里继续召牌。",
          emptyAction: "去发现",
          loadingTitle: "魔法召牌中",
          loadingPhrases: [
            "研究记忆正沿着词与引文缓缓聚成下一张牌",
            "论文的信号正在给新卡注入形状",
            "关键词正在编织下一道牌面纹路",
            "主题与引文正在为下一次召牌积蓄能量",
          ],
          retryAction: "重新召牌",
          errorTitle: "召牌暂时失败了",
          errorBody: "你的兴趣记忆仍然存在，只是这次新牌没有顺利凝成。可以直接重新召牌。",
          exhaustedTitle: "当前牌组暂时安静下来了",
          exhaustedBody: "现有兴趣记忆里没有更多新牌浮现了。可以再加几篇种子论文，或重新生成一次兴趣记忆。",
          actionEyebrow: "操作",
          actionHintIdle: "先翻开当前这张牌，才能执行收藏、加入记忆或查看详情。",
          actionHintReady: "右侧只保留动作入口。收藏、加入记忆、查看详情都在这里。",
          addToMemory: "加入记忆",
          alreadyInMemory: "已在记忆中",
          memoryCount: "记忆",
          memoryAdded: "这篇论文已加入当前兴趣记忆。",
          memoryAddedLocal: "这篇论文已加入本地记忆，登录后才会同步到 ScanSci。",
          memoryDuplicate: "这篇论文已经在当前记忆里了。",
          memoryFull: "当前兴趣记忆已满 20 篇，需要先回发现页替换或删掉一篇种子。",
          memoryFailed: "暂时无法把这篇论文加入记忆。",
        };

  const [cards, setCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState({});
  const [collected, setCollected] = useState(new Set());
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [drawStatus, setDrawStatus] = useState("idle");
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);
  const [loadingPhraseVisible, setLoadingPhraseVisible] = useState(true);
  const [cardMotion, setCardMotion] = useState({ tiltX: 0, tiltY: 0, glowX: 50, glowY: 50 });
  const [settled, setSettled] = useState({});
  const [stageMotion, setStageMotion] = useState({ x: 0, y: 0 });
  const [flipFlashActive, setFlipFlashActive] = useState(false);
  const [memoryFeedback, setMemoryFeedback] = useState("");
  const [memoryFeedbackKind, setMemoryFeedbackKind] = useState("info");
  const [isAddingToMemory, setIsAddingToMemory] = useState(false);

  const isDark = appTheme === "dark";
  const effectiveSeedPaperIds = useMemo(() => {
    const fallbackIds = Array.isArray(profileInfo?.seed_papers)
      ? profileInfo.seed_papers.map((paper) => paper?.paper_id).filter(Boolean)
      : [];
    const sourceIds = Array.isArray(seedPaperIds) && seedPaperIds.length > 0 ? seedPaperIds : fallbackIds;
    return [...new Set(sourceIds.filter(Boolean))];
  }, [profileInfo, seedPaperIds]);
  const hasInterestMemory =
    profileReady ||
    effectiveSeedPaperIds.length > 0 ||
    Boolean(profileInfo?.seed_count) ||
    Boolean(profileInfo?.embedding?.length);
  const fallbackSeedPapers = Array.isArray(profileInfo?.seed_papers) ? profileInfo.seed_papers : [];
  const seenIds = useRef(new Set());
  const flipFlashTimeoutRef = useRef(null);
  const loadingPhraseTimeoutRef = useRef(null);
  const seedKeyRef = useRef("");
  const shouldShowLoadingStage =
    cards.length === 0 &&
    hasInterestMemory &&
    effectiveSeedPaperIds.length > 0 &&
    (drawStatus === "idle" || drawStatus === "loading");

  async function requestCards(excludedPaperIds) {
    const result = await gachaDraw(
      effectiveSeedPaperIds,
      DRAW_BATCH_SIZE,
      cardMode,
      locale,
      excludedPaperIds,
      fallbackSeedPapers
    );
    return getGachaCards(result);
  }

  function acceptDrawnCards(nextCards) {
    nextCards.forEach((card) => seenIds.current.add(card.paper_id));
    setCards((prev) => [...prev, ...nextCards]);
    setDrawStatus("ready");
  }

  async function fetchMore() {
    if (isFetching || !hasInterestMemory || effectiveSeedPaperIds.length === 0) return;

    const hadCards = cards.length > 0;
    setIsFetching(true);
    setFetchError("");
    if (!hadCards) {
      setDrawStatus("loading");
    }

    try {
      const excluded = [...new Set([...getCollectedPaperIds(), ...seenIds.current])];
      const nextCards = await requestCards(excluded);

      if (nextCards.length > 0) {
        acceptDrawnCards(nextCards);
        return;
      }

      seenIds.current = new Set(getCollectedPaperIds());
      const retryCards = await requestCards([...seenIds.current]);

      if (retryCards.length > 0) {
        acceptDrawnCards(retryCards);
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
    const nextKey = effectiveSeedPaperIds.join(",");
    const previousIds = seedKeyRef.current ? seedKeyRef.current.split(",").filter(Boolean) : [];
    const nextIds = nextKey ? nextKey.split(",").filter(Boolean) : [];
    const isAdditiveSeedUpdate =
      previousIds.length > 0 &&
      nextIds.length >= previousIds.length &&
      previousIds.every((paperId) => nextIds.includes(paperId));

    seedKeyRef.current = nextKey;
    if (isAdditiveSeedUpdate) return;

    seenIds.current = new Set(getCollectedPaperIds());
    setCards([]);
    setCurrentIndex(0);
    setFlipped({});
    setCollected(new Set());
    setFetchError("");
    setDrawStatus("idle");
    setLoadingPhraseIndex(0);
    setLoadingPhraseVisible(true);
    setSettled({});
    setCardMotion({ tiltX: 0, tiltY: 0, glowX: 50, glowY: 50 });
    setStageMotion({ x: 0, y: 0 });
    setFlipFlashActive(false);
    setMemoryFeedback("");
    setMemoryFeedbackKind("info");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileReady, effectiveSeedPaperIds.join(","), cardMode]);

  useEffect(() => {
    if (hasInterestMemory && effectiveSeedPaperIds.length > 0) {
      fetchMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInterestMemory, effectiveSeedPaperIds.join(","), cardMode]);

  useEffect(() => {
    const remaining = cards.length - currentIndex - 1;
    if (
      hasInterestMemory &&
      effectiveSeedPaperIds.length > 0 &&
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
    setMemoryFeedback("");
    setMemoryFeedbackKind("info");
  }, [currentIndex]);

  useEffect(() => {
    return () => {
      if (flipFlashTimeoutRef.current) {
        clearTimeout(flipFlashTimeoutRef.current);
      }
      if (loadingPhraseTimeoutRef.current) {
        clearTimeout(loadingPhraseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (drawStatus !== "loading") {
      setLoadingPhraseIndex(0);
      setLoadingPhraseVisible(true);
      if (loadingPhraseTimeoutRef.current) {
        clearTimeout(loadingPhraseTimeoutRef.current);
        loadingPhraseTimeoutRef.current = null;
      }
      return undefined;
    }

    const intervalId = setInterval(() => {
      setLoadingPhraseVisible(false);
      if (loadingPhraseTimeoutRef.current) {
        clearTimeout(loadingPhraseTimeoutRef.current);
      }
      loadingPhraseTimeoutRef.current = setTimeout(() => {
        setLoadingPhraseIndex((current) => (current + 1) % ui.loadingPhrases.length);
        setLoadingPhraseVisible(true);
      }, LOADING_PHRASE_FADE_MS);
    }, LOADING_PHRASE_DURATION_MS);

    return () => {
      clearInterval(intervalId);
      if (loadingPhraseTimeoutRef.current) {
        clearTimeout(loadingPhraseTimeoutRef.current);
        loadingPhraseTimeoutRef.current = null;
      }
    };
  }, [drawStatus, ui.loadingPhrases]);

  if (!hasInterestMemory || effectiveSeedPaperIds.length === 0) {
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
  const isFlipped = Boolean(flipped[currentIndex]);
  const isCollected = collected.has(currentIndex);
  const modeLabel = cardMode === "research" ? t("card.researchMode") : t("card.discoveryMode");
  const loadingSubtitle = ui.loadingPhrases[loadingPhraseIndex];
  const memorySeedCount = fallbackSeedPapers.length > 0 ? fallbackSeedPapers.length : effectiveSeedPaperIds.length;
  const isCurrentInMemory = Boolean(
    currentCard?.paper_id &&
      (effectiveSeedPaperIds.includes(currentCard.paper_id) ||
        fallbackSeedPapers.some((paper) => paper?.paper_id === currentCard.paper_id))
  );
  const cardStyle = {
    "--gacha-tilt-x": `${cardMotion.tiltX}deg`,
    "--gacha-tilt-y": `${cardMotion.tiltY}deg`,
    "--gacha-glow-x": `${cardMotion.glowX}%`,
    "--gacha-glow-y": `${cardMotion.glowY}%`,
  };
  const layoutStyle = {
    "--draw-parallax-x": `${stageMotion.x}px`,
    "--draw-parallax-y": `${stageMotion.y}px`,
    "--draw-stage-card-height": "clamp(380px, calc(100svh - 250px), 720px)",
    "--draw-stage-card-width": "clamp(214px, calc(var(--draw-stage-card-height) * 0.5625), 405px)",
    "--draw-stage-ring-a-size": "clamp(420px, calc(var(--draw-stage-card-width) + 150px), 620px)",
    "--draw-stage-ring-b-size": "clamp(560px, calc(var(--draw-stage-card-width) + 320px), 820px)",
    "--draw-stage-orbit-1-size": "clamp(250px, calc(var(--draw-stage-card-width) + 18px), 300px)",
    "--draw-stage-orbit-2-size": "clamp(300px, calc(var(--draw-stage-card-width) + 84px), 392px)",
    "--draw-stage-orbit-3-size": "clamp(360px, calc(var(--draw-stage-card-width) + 160px), 500px)",
    "--draw-stage-orbit-4-size": "clamp(430px, calc(var(--draw-stage-card-width) + 250px), 620px)",
    "--draw-stage-orbit-5-size": "clamp(510px, calc(var(--draw-stage-card-width) + 350px), 760px)",
  };

  const isSettled = Boolean(settled[currentIndex]);
  const showScrollCard = Boolean(isSettled && currentCard);
  const feedbackToneStyle =
    memoryFeedbackKind === "success"
      ? { color: "#059669" }
      : memoryFeedbackKind === "warning"
        ? { color: "#d97706" }
        : memoryFeedbackKind === "error"
          ? { color: "#e11d48" }
          : { color: "var(--text-muted)" };

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

  async function handleAddToMemory() {
    if (!currentCard || !isFlipped || !onAddToMemory || isAddingToMemory) return;

    setIsAddingToMemory(true);
    try {
      const result = await onAddToMemory(currentCard);
      if (result?.ok) {
        setMemoryFeedback(result.reason === "local_only" ? ui.memoryAddedLocal : ui.memoryAdded);
        setMemoryFeedbackKind("success");
        return;
      }
      if (result?.reason === "duplicate") {
        setMemoryFeedback(ui.memoryDuplicate);
        setMemoryFeedbackKind("info");
        return;
      }
      if (result?.reason === "limit") {
        setMemoryFeedback(ui.memoryFull);
        setMemoryFeedbackKind("warning");
        return;
      }
      setMemoryFeedback(ui.memoryFailed);
      setMemoryFeedbackKind("error");
    } catch {
      setMemoryFeedback(ui.memoryFailed);
      setMemoryFeedbackKind("error");
    } finally {
      setIsAddingToMemory(false);
    }
  }

  function handleNext() {
    setCurrentIndex((prev) => prev + 1);
  }

  if (shouldShowLoadingStage) {
    return (
      <div
        className={`gacha-stage-view is-loading ${isDark ? "is-dark" : "is-light"}`}
        style={layoutStyle}
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
            <h3 className={`draw-loading-title ${locale === "zh" ? "font-heading-cn is-cn" : "font-heading"}`}>
              {ui.loadingTitle}
            </h3>
            <p className={`draw-loading-subtitle ${loadingPhraseVisible ? "is-visible" : "is-hidden"}`}>
              {loadingSubtitle}
            </p>
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
        actionLabel={ui.retryAction}
        onAction={fetchMore}
        secondaryActionLabel={ui.discoverLabel}
        onSecondaryAction={onOpenDiscover}
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
      style={layoutStyle}
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

      <div
        className={`gacha-shell ${isDark ? "is-dark" : "is-light"}`}
        style={{ width: "min(1280px, 100%)", paddingTop: "24px", paddingBottom: "24px" }}
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_228px]">
          <div className="gacha-stage" style={{ minHeight: "clamp(700px, calc(100svh - 180px), 940px)" }}>
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
                      <CardBack
                        zone={currentCard.zone}
                        tier={currentCard.tier}
                        modeLabel={modeLabel}
                        isNi={currentCard.is_ni}
                      />
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

          <aside className="flex flex-col gap-3">
            <div className="gacha-inspector-panel !p-4">
              <p className="gacha-shell-kicker">{ui.actionEyebrow}</p>
              <p className="mt-3 text-[13px] leading-7" style={{ color: "var(--text-muted)" }}>
                {isFlipped && currentCard ? ui.actionHintReady : ui.actionHintIdle}
              </p>

              <div className="mt-4 grid gap-3">
                <button
                  onClick={handleCollect}
                  disabled={!isFlipped || isCollected || !currentCard}
                  className={`app-accent-button rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-40`}
                >
                  {isCollected ? t("card.collected") : t("card.collect")}
                </button>

                <button
                  onClick={handleAddToMemory}
                  disabled={!isFlipped || !currentCard || isCurrentInMemory || isAddingToMemory}
                  className="app-outline-button rounded-2xl px-4 py-3 text-sm font-medium disabled:opacity-40"
                >
                  {isCurrentInMemory ? ui.alreadyInMemory : isAddingToMemory ? t("common.loading") : ui.addToMemory}
                </button>

                {onViewCard ? (
                  <button
                    onClick={() => currentCard && onViewCard(currentCard)}
                    disabled={!isFlipped || !currentCard}
                    className="app-outline-button rounded-2xl px-4 py-3 text-sm font-medium disabled:opacity-40"
                  >
                    {t("recommend.viewCard")}
                  </button>
                ) : null}

                <button
                  onClick={handleNext}
                  disabled={!isFlipped || !currentCard}
                  className="app-primary-button rounded-2xl px-4 py-3 text-sm font-medium disabled:opacity-40"
                >
                  {t("gacha.nextCard")}
                </button>
              </div>

              <div className="mt-4 border-t border-slate-200/80 pt-4">
                <div
                  className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "var(--text-soft)" }}
                >
                  <span>{ui.memoryCount}</span>
                  <span>{memorySeedCount} / {MEMORY_LIMIT}</span>
                </div>
                {(memoryFeedback || fetchError) && (
                  <p
                    className="mt-3 text-[12px] leading-6"
                    style={memoryFeedback ? feedbackToneStyle : { color: "#e11d48" }}
                  >
                    {memoryFeedback || fetchError}
                  </p>
                )}
                {isFetching ? (
                  <div className="draw-fetch-row mt-3">
                    <div className="draw-fetch-dot" />
                    <span>{t("draw.drawing")}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <button onClick={onOpenDiscover} className="gacha-text-button self-start px-1 text-sm">
              {ui.discoverLabel}
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
