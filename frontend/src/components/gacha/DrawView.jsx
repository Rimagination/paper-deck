import { useMemo, useState } from "react";
import { useScanSciAuth } from "../../auth";
import { gachaDraw } from "../../api/backend";
import { useLanguage } from "../../i18n";
import { getTierConfig } from "../cards/TierBadge";
import { buildInterestMemory } from "../seeds/interestMemory";

function PreviewCardBack({ theme, zoneLabel, modeLabel, flipLabel }) {
  return (
    <div className={`deck-preview-card ${theme.cardClass}`}>
      <div className="deck-preview-grid" />
      <div className="relative z-[1] flex h-full flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-3">
          <span className={`inline-flex rounded-xl border px-3 py-1 text-xs font-bold ${theme.tagClass}`}>
            {zoneLabel}
          </span>
          <span className={`text-[10px] font-semibold uppercase tracking-[0.28em] ${theme.authorColor}`}>
            {modeLabel}
          </span>
        </div>

        <div className="space-y-3">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.34em] ${theme.authorColor}`}>
            PaperDeck
          </p>
          <div className="space-y-2">
            <div className={`h-2 rounded-full ${theme.tagClass}`} />
            <div className={`h-2 w-4/5 rounded-full ${theme.tagClass}`} />
            <div className={`h-2 w-3/5 rounded-full ${theme.tagClass}`} />
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

export default function DrawView({ profileInfo, profileReady, seedPaperIds, cardMode, onStartGacha, onOpenDiscover }) {
  const { t, locale } = useLanguage();
  const { getCollectedPaperIds } = useScanSciAuth();
  const [drawCount, setDrawCount] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawError, setDrawError] = useState("");

  const memory = useMemo(() => buildInterestMemory(profileInfo), [profileInfo]);
  const theme = getTierConfig(memory.dominantZone);
  const excludedPaperIds = useMemo(() => [...getCollectedPaperIds()], [getCollectedPaperIds]);
  const modeLabel = cardMode === "research" ? t("card.researchMode") : t("card.discoveryMode");

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
      <section className="paper-surface rounded-[30px] p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-indigo-500">
              {t("draw.eyebrow")}
            </p>
            <h2 className="mt-3 font-heading text-3xl font-semibold text-slate-950 sm:text-[34px]">
              {t("draw.title")}
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">{t("draw.subtitle")}</p>
          </div>
          <button
            onClick={onOpenDiscover}
            className="app-outline-button rounded-2xl px-4 py-2.5 text-sm font-medium"
          >
            {t("draw.backToDiscover")}
          </button>
        </div>

        <div className="mt-7 grid gap-8 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-[28px] bg-slate-950 text-white shadow-[0_28px_80px_rgba(15,23,42,0.34)]">
            <div className="border-b border-white/10 px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">
                {t("draw.previewEyebrow")}
              </p>
              <h3 className="mt-2 text-2xl font-semibold">{memory.headline}</h3>
              <p className="mt-2 text-sm leading-6 text-white/62">{t("draw.previewSubtitle")}</p>
            </div>

            <div className="px-6 py-6">
              <div className="deck-preview-stage">
                <div className="deck-preview-shadow" />
                <div className="deck-preview-layer deck-preview-layer-back opacity-55">
                  <PreviewCardBack
                    theme={theme}
                    zoneLabel={memory.dominantZone || "Deck"}
                    modeLabel={modeLabel}
                    flipLabel={t("gacha.tapToReveal")}
                  />
                </div>
                <div className="deck-preview-layer deck-preview-layer-mid opacity-75">
                  <PreviewCardBack
                    theme={theme}
                    zoneLabel={memory.dominantZone || "Deck"}
                    modeLabel={modeLabel}
                    flipLabel={t("gacha.tapToReveal")}
                  />
                </div>
                <div className="deck-preview-layer deck-preview-layer-front">
                  <PreviewCardBack
                    theme={theme}
                    zoneLabel={memory.dominantZone || "Deck"}
                    modeLabel={modeLabel}
                    flipLabel={t("gacha.tapToReveal")}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  {t("draw.deckSeedCount")}
                </p>
                <p className="mt-3 text-3xl font-semibold text-slate-950">{memory.papers.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  {t("draw.deckCollectedCount")}
                </p>
                <p className="mt-3 text-3xl font-semibold text-slate-950">{excludedPaperIds.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  {t("draw.deckMode")}
                </p>
                <p className="mt-3 text-xl font-semibold text-slate-950">{modeLabel}</p>
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                    {t("draw.controlsEyebrow")}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-slate-950">{t("draw.controlsTitle")}</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{t("draw.controlsBody")}</p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {[1, 3, 5].map((count) => (
                  <button
                    key={count}
                    onClick={() => setDrawCount(count)}
                    className={`app-pill-button rounded-full px-4 py-2 text-sm font-semibold ${
                      drawCount === count ? "is-active" : ""
                    }`}
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

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
              <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  {t("draw.memorySource")}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {memory.echoes.map((entry) => (
                    <span
                      key={entry}
                      className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
                    >
                      {entry}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  {t("draw.filterEyebrow")}
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-600">{t("draw.filterBody", { count: excludedPaperIds.length })}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
