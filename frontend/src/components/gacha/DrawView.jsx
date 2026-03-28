import { useMemo, useState } from "react";
import { useScanSciAuth } from "../../auth";
import { gachaDraw } from "../../api/backend";
import { useLanguage } from "../../i18n";
import { useTheme } from "../../theme";
import { getTierConfig } from "../cards/TierBadge";
import { buildInterestMemory } from "../seeds/interestMemory";

function PreviewCardBack({ theme, zoneLabel, modeLabel, flipLabel }) {
  return (
    <div className={`deck-preview-card ${theme.cardClass}`}>
      <div className="deck-preview-grid" />
      <div className="deck-preview-foil" />
      <div className="relative z-[1] flex h-full flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-3">
          <span className={`inline-flex rounded-xl border px-3 py-1 text-xs font-bold ${theme.tagClass}`}>
            {zoneLabel}
          </span>
          <span className={`text-[10px] font-semibold uppercase tracking-[0.28em] ${theme.authorColor}`}>
            {modeLabel}
          </span>
        </div>
        <div className="space-y-4 text-center">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.34em] ${theme.authorColor}`}>PaperDeck</p>
          <div className={`deck-preview-emblem ${theme.tagClass}`}>
            <span className="deck-preview-emblem-core">*</span>
          </div>
          <div className="space-y-2">
            <div className={`h-2 rounded-full ${theme.tagClass}`} />
            <div className={`mx-auto h-2 w-4/5 rounded-full ${theme.tagClass}`} />
            <div className={`mx-auto h-2 w-3/5 rounded-full ${theme.tagClass}`} />
          </div>
        </div>
        <div className="flex items-end justify-between">
          <div className={`deck-preview-orb ${theme.loaderCoreClass}`} />
          <div className={`text-[10px] font-medium ${theme.authorColor}`}>{flipLabel}</div>
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

function formatYearRange(t, memory) {
  if (memory.yearMin && memory.yearMax) {
    return memory.yearMin === memory.yearMax
      ? String(memory.yearMin)
      : `${memory.yearMin}-${memory.yearMax}`;
  }
  return t("seeds.memoryYearsFallback");
}

export default function DrawView({ profileInfo, profileReady, seedPaperIds, cardMode, onStartGacha, onOpenDiscover }) {
  const { t, locale } = useLanguage();
  const { theme: appTheme } = useTheme();
  const { getCollectedPaperIds } = useScanSciAuth();
  const [drawCount, setDrawCount] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawError, setDrawError] = useState("");
  const [previewMotion, setPreviewMotion] = useState({ tiltX: 0, tiltY: 0, glowX: 50, glowY: 50 });

  const memory = useMemo(() => buildInterestMemory(profileInfo), [profileInfo]);
  const theme = getTierConfig(memory.dominantZone);
  const excludedPaperIds = useMemo(() => [...getCollectedPaperIds()], [getCollectedPaperIds]);
  const modeLabel = cardMode === "research" ? t("card.researchMode") : t("card.discoveryMode");
  const yearRange = useMemo(() => formatYearRange(t, memory), [memory, t]);
  const leadVenue = memory.venues[0]?.name;
  const memorySummary = leadVenue
    ? t("seeds.memorySummary", { venue: leadVenue, years: yearRange })
    : t("seeds.memorySummaryFallback", { years: yearRange });
  const echoList = memory.echoes.length > 0 ? memory.echoes : [memory.headline];
  const isDark = appTheme === "dark";

  const previewStyle = {
    "--deck-tilt-x": `${previewMotion.tiltX}deg`,
    "--deck-tilt-y": `${previewMotion.tiltY}deg`,
    "--deck-glow-x": `${previewMotion.glowX}%`,
    "--deck-glow-y": `${previewMotion.glowY}%`,
  };

  function handlePreviewMove(event) {
    if (isDrawing) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    setPreviewMotion({ tiltX: (0.5 - y) * 14, tiltY: (x - 0.5) * 18, glowX: x * 100, glowY: y * 100 });
  }

  function resetPreviewMotion() {
    setPreviewMotion({ tiltX: 0, tiltY: 0, glowX: 50, glowY: 50 });
  }

  async function handleDraw() {
    if (!profileReady || seedPaperIds.length === 0 || isDrawing) return;
    setIsDrawing(true);
    setDrawError("");
    try {
      const result = await gachaDraw(seedPaperIds, drawCount, cardMode, locale, excludedPaperIds);
      if (Array.isArray(result.cards) && result.cards.length > 0) {
        onStartGacha?.(result.cards);
      } else {
        setDrawError(t("draw.emptyPool"));
      }
    } catch {
      setDrawError(t("draw.error"));
    }
    setIsDrawing(false);
  }

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

  return (
    <div className={`draw-arena ${isDark ? "is-dark" : "is-light"}`} style={previewStyle}>
      {/* ambient layers */}
      <div className="draw-arena-mesh" />
      <div className="draw-arena-spot draw-arena-spot-a" />
      <div className="draw-arena-spot draw-arena-spot-b" />
      <div className="draw-arena-spot draw-arena-spot-c" />

      {/* top bar: memory chips + meta */}
      <div className="draw-arena-topbar">
        <div className="draw-arena-chips">
          {echoList.slice(0, 5).map((entry, i) => (
            <span key={`${entry}-${i}`} className="draw-arena-chip" style={{ animationDelay: `${i * 0.3}s` }}>
              {entry}
            </span>
          ))}
        </div>
        <div className="draw-arena-meta">
          <span className="draw-arena-pill">{modeLabel}</span>
          <span className="draw-arena-pill">{memory.dominantZone || "Unrated"}</span>
        </div>
      </div>

      {/* central headline */}
      <div className="draw-arena-headline">
        <p className="draw-arena-eyebrow">{t("draw.eyebrow")}</p>
        <h2 className="draw-arena-title">{memory.headline}</h2>
        <p className="draw-arena-sub">{memorySummary}</p>
      </div>

      {/* clickable card stack */}
      <div
        className={`draw-arena-stack-shell ${isDrawing ? "is-drawing" : ""}`}
        onMouseMove={handlePreviewMove}
        onMouseLeave={resetPreviewMotion}
        onClick={handleDraw}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && handleDraw()}
        aria-label={t("draw.drawButton")}
      >
        <div className="draw-arena-ring draw-arena-ring-a" />
        <div className="draw-arena-ring draw-arena-ring-b" />
        <div className="draw-arena-shadow" />

        <div className="draw-stage-card-wrap draw-stage-card-back">
          <PreviewCardBack theme={theme} zoneLabel={memory.dominantZone || "Deck"} modeLabel={modeLabel} flipLabel={t("gacha.tapToReveal")} />
        </div>
        <div className="draw-stage-card-wrap draw-stage-card-mid">
          <PreviewCardBack theme={theme} zoneLabel={memory.dominantZone || "Deck"} modeLabel={modeLabel} flipLabel={t("gacha.tapToReveal")} />
        </div>
        <div className="draw-stage-card-wrap draw-stage-card-front">
          <PreviewCardBack theme={theme} zoneLabel={memory.dominantZone || "Deck"} modeLabel={modeLabel} flipLabel={t("gacha.tapToReveal")} />
        </div>

        {isDrawing && <div className="draw-arena-spinner" />}
      </div>

      {/* count selector + draw CTA */}
      <div className="draw-arena-controls">
        <div className="draw-arena-count-row">
          {[1, 3, 5].map((count) => (
            <button
              key={count}
              onClick={(e) => { e.stopPropagation(); setDrawCount(count); }}
              className={`draw-count-chip ${drawCount === count ? "is-active" : ""}`}
            >
              {t("draw.countLabel", { count })}
            </button>
          ))}
        </div>

        <button
          onClick={handleDraw}
          disabled={isDrawing}
          className="app-accent-button draw-arena-cta"
        >
          {isDrawing ? t("draw.drawing") : t("draw.drawButton")}
        </button>

        {drawError && <p className="draw-arena-error">{drawError}</p>}
      </div>

      {/* bottom stats strip */}
      <div className="draw-arena-footer">
        <span className="draw-arena-stat">
          <span className="draw-arena-stat-num">{memory.papers.length}</span>
          {t("draw.deckSeedCount")}
        </span>
        <span className="draw-arena-stat">
          <span className="draw-arena-stat-num">{excludedPaperIds.length}</span>
          {t("draw.deckCollectedCount")}
        </span>
        <button onClick={onOpenDiscover} className="app-outline-button draw-arena-back-btn">
          {t("draw.backToDiscover")}
        </button>
      </div>
    </div>
  );
}
