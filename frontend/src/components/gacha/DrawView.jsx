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
        <h2 className="font-heading text-3xl font-semibold text-slate-950">{title}</h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">{body}</p>
      </div>
      <button
        onClick={onAction}
        className="app-primary-button mt-8 rounded-2xl px-5 py-3 text-sm font-medium"
      >
        {actionLabel}
      </button>
    </section>
  );
}

function MetricStrip({ label, value }) {
  return (
    <div className="draw-ritual-metric">
      <p className="draw-ritual-kicker">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function StageChip({ children, index }) {
  return (
    <span className="draw-stage-memory-chip" style={{ animationDelay: `${index * 0.35}s` }}>
      {children}
    </span>
  );
}

function formatYearRange(t, memory) {
  if (memory.yearMin && memory.yearMax) {
    return memory.yearMin === memory.yearMax ? String(memory.yearMin) : `${memory.yearMin}-${memory.yearMax}`;
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
  const previewStyle = {
    "--deck-tilt-x": `${previewMotion.tiltX}deg`,
    "--deck-tilt-y": `${previewMotion.tiltY}deg`,
    "--deck-glow-x": `${previewMotion.glowX}%`,
    "--deck-glow-y": `${previewMotion.glowY}%`,
  };

  function handlePreviewMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    setPreviewMotion({
      tiltX: (0.5 - y) * 10,
      tiltY: (x - 0.5) * 12,
      glowX: x * 100,
      glowY: y * 100,
    });
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
    } catch (error) {
      console.error("Draw failed:", error);
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
    <div className="space-y-6">
      <section className="paper-surface draw-ritual-shell rounded-[34px] p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="draw-ritual-kicker text-indigo-500">{t("draw.eyebrow")}</p>
            <h2 className="mt-3 font-heading text-3xl font-semibold text-slate-950 sm:text-[34px]">
              {t("draw.title")}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">{t("draw.subtitle")}</p>
          </div>
          <button
            onClick={onOpenDiscover}
            className="app-outline-button rounded-2xl px-4 py-2.5 text-sm font-medium"
          >
            {t("draw.backToDiscover")}
          </button>
        </div>

        <div className="mt-8 draw-ritual-grid">
          <aside className="draw-ritual-sidebar">
            <div className="draw-ritual-panel">
              <p className="draw-ritual-kicker">{t("seeds.memoryEyebrow")}</p>
              <h3 className="mt-3 font-heading text-[28px] font-semibold text-slate-950">{memory.headline}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">{memorySummary}</p>
            </div>

            <div className="draw-ritual-stats">
              <MetricStrip label={t("draw.deckSeedCount")} value={memory.papers.length} />
              <MetricStrip label={t("draw.deckCollectedCount")} value={excludedPaperIds.length} />
              <MetricStrip label={t("draw.deckMode")} value={modeLabel} />
            </div>

            <div className="draw-ritual-panel">
              <p className="draw-ritual-kicker">{t("draw.controlsEyebrow")}</p>
              <h3 className="mt-3 text-2xl font-semibold text-slate-950">{t("draw.controlsTitle")}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">{t("draw.controlsBody")}</p>

              <div className="mt-6 flex flex-wrap gap-2">
                {[1, 3, 5].map((count) => (
                  <button
                    key={count}
                    onClick={() => setDrawCount(count)}
                    className={`draw-count-chip ${drawCount === count ? "is-active" : ""}`}
                  >
                    {t("draw.countLabel", { count })}
                  </button>
                ))}
              </div>

              <button
                onClick={handleDraw}
                disabled={isDrawing}
                className="app-accent-button mt-6 inline-flex items-center justify-center rounded-2xl px-6 py-3 text-sm font-semibold disabled:opacity-50"
              >
                {isDrawing ? t("draw.drawing") : t("draw.drawButton")}
              </button>

              {drawError && <p className="mt-3 text-sm text-rose-600">{drawError}</p>}
            </div>
          </aside>

          <div className="draw-stage-panel">
            <div
              className={`draw-stage ${appTheme === "dark" ? "is-dark" : "is-light"}`}
              style={previewStyle}
              onMouseMove={handlePreviewMove}
              onMouseLeave={resetPreviewMotion}
            >
              <div className="draw-stage-mesh" />
              <div className="draw-stage-spot draw-stage-spot-a" />
              <div className="draw-stage-spot draw-stage-spot-b" />
              <div className="draw-stage-spot draw-stage-spot-c" />

              <div className="draw-stage-header">
                <span className="draw-stage-mode">{modeLabel}</span>
                <span className="draw-stage-zone">{memory.dominantZone || "Unrated"}</span>
              </div>

              <div className="draw-stage-chip-cloud">
                {echoList.map((entry, index) => (
                  <StageChip key={`${entry}-${index}`} index={index}>
                    {entry}
                  </StageChip>
                ))}
              </div>

              <div className="draw-stage-stack-shell">
                <div className="draw-stage-ring draw-stage-ring-a" />
                <div className="draw-stage-ring draw-stage-ring-b" />
                <div className="draw-stage-shadow" />

                <div className="draw-stage-card-wrap draw-stage-card-back">
                  <PreviewCardBack
                    theme={theme}
                    zoneLabel={memory.dominantZone || "Deck"}
                    modeLabel={modeLabel}
                    flipLabel={t("gacha.tapToReveal")}
                  />
                </div>

                <div className="draw-stage-card-wrap draw-stage-card-mid">
                  <PreviewCardBack
                    theme={theme}
                    zoneLabel={memory.dominantZone || "Deck"}
                    modeLabel={modeLabel}
                    flipLabel={t("gacha.tapToReveal")}
                  />
                </div>

                <div className="draw-stage-card-wrap draw-stage-card-front">
                  <PreviewCardBack
                    theme={theme}
                    zoneLabel={memory.dominantZone || "Deck"}
                    modeLabel={modeLabel}
                    flipLabel={t("gacha.tapToReveal")}
                  />
                </div>
              </div>

              <div className="draw-stage-footer">
                <div>
                  <p className="draw-ritual-kicker">{t("draw.previewEyebrow")}</p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {t("draw.previewSubtitle")}
                  </p>
                </div>
                <div className="draw-stage-footer-note">{t("draw.filterBody", { count: excludedPaperIds.length })}</div>
              </div>
            </div>
          </div>

          <aside className="draw-ritual-sidebar">
            <div className="draw-ritual-panel">
              <p className="draw-ritual-kicker">{t("draw.memorySource")}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {echoList.map((entry) => (
                  <span
                    key={entry}
                    className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
                  >
                    {entry}
                  </span>
                ))}
              </div>
            </div>

            <div className="draw-ritual-panel">
              <p className="draw-ritual-kicker">{t("seeds.memoryVenues")}</p>
              {memory.venues.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {memory.venues.map((venue) => (
                    <div key={venue.name} className="draw-venue-row">
                      <span className="text-sm font-medium text-slate-800">{venue.name}</span>
                      <span className="text-xs font-semibold text-slate-400">{venue.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-7 text-slate-600">{t("seeds.memoryVenueFallback")}</p>
              )}
            </div>

            <div className="draw-ritual-panel">
              <p className="draw-ritual-kicker">{t("draw.filterEyebrow")}</p>
              <p className="mt-3 text-sm leading-7 text-slate-600">{t("draw.filterBody", { count: excludedPaperIds.length })}</p>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
