import { useMemo, useState } from "react";
import TierBadge from "../cards/TierBadge";
import { buildInterestMemory } from "./interestMemory";

const CLOUD_WIDTH = 1000;
const CLOUD_HEIGHT = 620;
const CLOUD_MARGIN = 34;
const CLOUD_WORD_PADDING = 16;
const CLOUD_MAX_TEXT_WIDTH = 250;
const CLOUD_CORE_RECT = {
  left: 500 - 190,
  right: 500 + 190,
  top: 310 - 92,
  bottom: 310 + 92,
};

function estimateCharacterWidth(char, fontSize) {
  if (/\s/.test(char)) return fontSize * 0.26;
  if (/[-_/]/.test(char)) return fontSize * 0.36;
  if (/[\u4e00-\u9fff]/.test(char)) return fontSize * 0.96;
  if (/[A-Z]/.test(char)) return fontSize * 0.68;
  return fontSize * 0.58;
}

function estimateWordWidth(word, fontSize) {
  return [...word].reduce((total, char) => total + estimateCharacterWidth(char, fontSize), 0);
}

function createRect(x, y, width, height, padding = 0) {
  return {
    left: x - width / 2 - padding,
    right: x + width / 2 + padding,
    top: y - height / 2 - padding,
    bottom: y + height / 2 + padding,
  };
}

function rectsOverlap(left, right) {
  return !(
    left.right <= right.left ||
    left.left >= right.right ||
    left.bottom <= right.top ||
    left.top >= right.bottom
  );
}

function fitsCloud(rect, placedRects) {
  if (
    rect.left < CLOUD_MARGIN ||
    rect.right > CLOUD_WIDTH - CLOUD_MARGIN ||
    rect.top < CLOUD_MARGIN ||
    rect.bottom > CLOUD_HEIGHT - CLOUD_MARGIN
  ) {
    return false;
  }

  if (rectsOverlap(rect, CLOUD_CORE_RECT)) {
    return false;
  }

  return placedRects.every((placedRect) => !rectsOverlap(rect, placedRect));
}

function fallbackPlacement(index, width, height, placedRects) {
  const columns = [
    { x: 190, yStart: 132 },
    { x: 810, yStart: 132 },
    { x: 190, yStart: 470 },
    { x: 810, yStart: 470 },
  ];

  for (let offset = 0; offset < columns.length; offset += 1) {
    const column = columns[(index + offset) % columns.length];
    const row = Math.floor((index + offset) / columns.length);
    const yDirection = column.yStart < CLOUD_HEIGHT / 2 ? 1 : -1;
    const y = column.yStart + row * 54 * yDirection;
    const rect = createRect(column.x, y, width, height, CLOUD_WORD_PADDING);
    if (fitsCloud(rect, placedRects)) {
      return { x: column.x, y, rect };
    }
  }

  const x = index % 2 === 0 ? 170 : 830;
  const y = 100 + (index % 6) * 60;
  return {
    x,
    y,
    rect: createRect(x, y, width, height, CLOUD_WORD_PADDING),
  };
}

function buildCloudLayout(keywordEntries, maxCount) {
  const placedRects = [];
  const centerX = CLOUD_WIDTH / 2;
  const centerY = CLOUD_HEIGHT / 2;

  return keywordEntries.map((entry, index) => {
    const ratio = maxCount > 0 ? entry.count / maxCount : 1;
    let fontSize = 26;
    let width = estimateWordWidth(entry.word, fontSize);

    if (width > CLOUD_MAX_TEXT_WIDTH) {
      const scale = CLOUD_MAX_TEXT_WIDTH / width;
      fontSize *= scale;
      width = estimateWordWidth(entry.word, fontSize);
    }

    const height = fontSize * 1.12;
    const opacity = 0.52 + ratio * 0.18;

    let placement = null;

    for (let step = 0; step < 240; step += 1) {
      const angle = index * 0.84 + step * 0.48;
      const radius = 156 + step * 4.4;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius * 0.72;
      const rect = createRect(x, y, width, height, CLOUD_WORD_PADDING);

      if (fitsCloud(rect, placedRects)) {
        placement = { x, y, rect };
        break;
      }
    }

    if (!placement) {
      placement = fallbackPlacement(index, width, height, placedRects);
    }

    placedRects.push(placement.rect);

    return {
      key: `${entry.word}-${index}`,
      word: entry.word,
      x: placement.x,
      y: placement.y,
      fontSize,
      opacity,
    };
  });
}

function MemoryWord({ placement }) {
  return (
    <text
      className="memory-cloud-word"
      x={placement.x}
      y={placement.y}
      textAnchor="middle"
      dominantBaseline="middle"
      style={{ fontSize: `${placement.fontSize}px`, opacity: placement.opacity }}
    >
      {placement.word}
    </text>
  );
}

function ZoneBar({ zone, count, maxCount }) {
  const width = `${(count / maxCount) * 100}%`;
  const fillClass = {
    "1\u533a": "bg-amber-300",
    "2\u533a": "bg-violet-300",
    "3\u533a": "bg-sky-300",
    "4\u533a": "bg-slate-300",
    Unrated: "bg-slate-300/75",
  }[zone];

  return (
    <div className="flex items-center gap-3">
      <TierBadge zone={zone === "Unrated" ? null : zone} size="sm" />
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${fillClass}`} style={{ width }} />
      </div>
      <span className="w-5 text-right text-xs font-medium text-slate-500">{count}</span>
    </div>
  );
}

const TABS = ["stats", "echoes", "venues", "zones"];
const TAB_LABEL_KEYS = {
  stats: "seeds.memoryTabStats",
  echoes: "seeds.memoryTabEchoes",
  venues: "seeds.memoryTabVenues",
  zones: "seeds.memoryTabZones",
};

export default function InterestWorkspace({ profileInfo, onOpenDraw, t }) {
  const memory = useMemo(() => buildInterestMemory(profileInfo), [profileInfo]);
  const [activeTab, setActiveTab] = useState("stats");

  const maxKeywordCount = Math.max(...memory.keywordEntries.map((entry) => entry.count), 1);
  const cloudPlacements = useMemo(
    () => buildCloudLayout(memory.keywordEntries, maxKeywordCount),
    [memory.keywordEntries, maxKeywordCount]
  );
  const maxZoneCount = Math.max(...memory.zoneCounts.map((entry) => entry.count), 1);
  const timeSpan = memory.yearMin && memory.yearMax
    ? `${memory.yearMin} - ${memory.yearMax}`
    : t("seeds.memoryYearsFallback");

  return (
    <section className="paper-surface rounded-[30px] p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-600">
            {t("seeds.memoryEyebrow")}
          </p>
          <h3 className="mt-3 font-heading-cn text-3xl font-semibold text-slate-950 sm:text-[34px]">
            {t("seeds.memoryTitle")}
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            {memory.venues.length > 0
              ? t("seeds.memorySummary", {
                  venue: memory.venues[0].name,
                  years: timeSpan,
                })
              : t("seeds.memorySummaryFallback", { years: timeSpan })}
          </p>
        </div>

        <button
          onClick={onOpenDraw}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          {t("seeds.openDraw")}
        </button>
      </div>

      <div className="mt-7 memory-cloud-layout">
        <div className="memory-cloud-surface">
          <div className="memory-cloud-backdrop" />
          <div className="memory-cloud-ring memory-cloud-ring-a" />
          <div className="memory-cloud-ring memory-cloud-ring-b" />
          <svg
            viewBox={`0 0 ${CLOUD_WIDTH} ${CLOUD_HEIGHT}`}
            className="memory-cloud-canvas"
            aria-hidden="true"
          >
            {cloudPlacements.map((placement) => (
              <MemoryWord key={placement.key} placement={placement} />
            ))}
          </svg>
          <div className="memory-cloud-core">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-700/70">
              {t("seeds.memoryCloudEyebrow")}
            </p>
          </div>
        </div>

        <aside className="memory-cloud-side">
          <div className="memory-cloud-tabs">
            {TABS.map((id) => (
              <button
                key={id}
                className={`memory-cloud-tab${activeTab === id ? " memory-cloud-tab--active" : ""}`}
                onClick={() => setActiveTab(id)}
              >
                {t(TAB_LABEL_KEYS[id])}
              </button>
            ))}
          </div>

          <div className="memory-cloud-tab-content">
            {activeTab === "stats" && (
              <div className="memory-cloud-summary-panel">
                <div className="memory-cloud-stat-list">
                  <div className="memory-cloud-stat-row">
                    <span>{t("seeds.memorySeedCount")}</span>
                    <strong>{memory.papers.length}</strong>
                  </div>
                  <div className="memory-cloud-stat-row">
                    <span>{t("seeds.memoryYears")}</span>
                    <strong>{timeSpan}</strong>
                  </div>
                  <div className="memory-cloud-stat-row">
                    <span>{t("seeds.memoryCitations")}</span>
                    <strong>{memory.avgCitations}</strong>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "echoes" && (
              <div className="rounded-[26px] border border-slate-200/80 bg-white/90 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  {t("seeds.memoryEchoes")}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {memory.echoes.map((entry) => (
                    <span
                      key={entry}
                      className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-normal text-sky-700"
                    >
                      {entry}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "venues" && (
              <div className="rounded-[26px] border border-slate-200/80 bg-white/90 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  {t("seeds.memoryVenues")}
                </p>
                <div className="mt-4 space-y-3">
                  {memory.venues.map((venue) => (
                    <div key={venue.name} className="flex items-center justify-between gap-3">
                      <p className="line-clamp-1 text-sm font-normal text-slate-700">{venue.name}</p>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-normal text-slate-500">
                        {venue.count}
                      </span>
                    </div>
                  ))}
                  {memory.venues.length === 0 && (
                    <p className="text-sm text-slate-400">{t("seeds.memoryVenueFallback")}</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === "zones" && (
              <div className="rounded-[26px] border border-slate-200/80 bg-white/90 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  {t("seeds.memoryZones")}
                </p>
                <div className="mt-4 space-y-3">
                  {memory.zoneCounts.map((entry) => (
                    <ZoneBar key={entry.zone} zone={entry.zone} count={entry.count} maxCount={maxZoneCount} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
