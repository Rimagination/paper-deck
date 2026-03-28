const LEGACY_ZONE_MAP = {
  SSR: "1区",
  SR: "2区",
  R: "3区",
  N: "4区",
};

export const ZONE_CONFIG = {
  "1区": {
    cardClass: "card-zone-1",
    badgeClass:
      "bg-gradient-to-br from-amber-300 to-yellow-500 text-amber-950 shadow-lg shadow-amber-500/50",
    titleColor: "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]",
    authorColor: "text-amber-50/80",
    labelColor: "text-amber-100/70",
    bodyColor: "text-white/95",
    tagClass: "bg-amber-950/70 text-amber-50 border border-amber-500/35",
    insightClass: "bg-amber-950/80 text-white border border-amber-500/30",
    dividerClass: "border-amber-100/15",
    citationClass: "text-amber-50/80",
    matchClass: "bg-amber-950/72 text-white border border-amber-400/35",
    doiClass: "text-amber-50/90 hover:text-white",
    loaderRingClass: "border-amber-300/70",
    loaderCoreClass: "bg-amber-200",
  },
  "2区": {
    cardClass: "card-zone-2",
    badgeClass:
      "bg-gradient-to-br from-violet-200 to-fuchsia-300 text-violet-950 shadow-lg shadow-violet-400/40",
    titleColor: "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]",
    authorColor: "text-violet-50/80",
    labelColor: "text-violet-100/70",
    bodyColor: "text-white/95",
    tagClass: "bg-violet-950/70 text-violet-50 border border-violet-400/30",
    insightClass: "bg-violet-950/80 text-white border border-violet-400/30",
    dividerClass: "border-violet-100/15",
    citationClass: "text-violet-50/80",
    matchClass: "bg-violet-950/70 text-white border border-violet-300/30",
    doiClass: "text-violet-50/90 hover:text-white",
    loaderRingClass: "border-violet-200/70",
    loaderCoreClass: "bg-violet-100",
  },
  "3区": {
    cardClass: "card-zone-3",
    badgeClass:
      "bg-gradient-to-br from-sky-300 to-blue-500 text-blue-950 shadow-lg shadow-blue-500/40",
    titleColor: "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]",
    authorColor: "text-sky-50/80",
    labelColor: "text-sky-100/70",
    bodyColor: "text-white/95",
    tagClass: "bg-blue-950/70 text-sky-50 border border-sky-300/30",
    insightClass: "bg-blue-950/75 text-white border border-sky-300/25",
    dividerClass: "border-sky-100/15",
    citationClass: "text-sky-50/80",
    matchClass: "bg-blue-950/70 text-white border border-sky-300/30",
    doiClass: "text-sky-50/90 hover:text-white",
    loaderRingClass: "border-sky-200/70",
    loaderCoreClass: "bg-sky-100",
  },
  "4区": {
    cardClass: "card-zone-4",
    badgeClass:
      "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900 shadow-lg shadow-slate-500/35",
    titleColor: "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]",
    authorColor: "text-slate-100/80",
    labelColor: "text-slate-100/70",
    bodyColor: "text-white/95",
    tagClass: "bg-slate-950/60 text-white border border-slate-200/15",
    insightClass: "bg-slate-950/70 text-white border border-slate-200/15",
    dividerClass: "border-white/10",
    citationClass: "text-slate-100/80",
    matchClass: "bg-slate-950/70 text-white border border-slate-200/15",
    doiClass: "text-slate-100/88 hover:text-white",
    loaderRingClass: "border-slate-300/70",
    loaderCoreClass: "bg-slate-200",
  },
  default: {
    cardClass: "card-zone-default",
    badgeClass: "bg-slate-100 text-slate-700 border border-slate-200",
    titleColor: "text-slate-900",
    authorColor: "text-slate-500",
    labelColor: "text-slate-400",
    bodyColor: "text-slate-600",
    tagClass: "bg-slate-100 text-slate-600 border border-slate-200",
    insightClass: "bg-slate-50 text-slate-700 border border-slate-200",
    dividerClass: "border-slate-200",
    citationClass: "text-slate-400",
    matchClass: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    doiClass: "text-slate-400 hover:text-indigo-600",
    loaderRingClass: "border-slate-300/70",
    loaderCoreClass: "bg-slate-300",
  },
};

export function normalizeZone(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  if (ZONE_CONFIG[raw]) return raw;
  return LEGACY_ZONE_MAP[raw] || null;
}

export function getZoneLabel(value) {
  return normalizeZone(value) || "Unrated";
}

export function getTierConfig(value) {
  return ZONE_CONFIG[normalizeZone(value)] || ZONE_CONFIG.default;
}

export function getTierStyles(value) {
  const config = getTierConfig(value);
  return { border: config.cardClass, bg: "", badge: config.badgeClass };
}

export default function TierBadge({ zone, tier, size = "md" }) {
  const value = zone ?? tier;
  const config = getTierConfig(value);
  const label = getZoneLabel(value);
  const sizeClass = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg font-bold tracking-wide ${config.badgeClass} ${sizeClass}`}
    >
      {label}
    </span>
  );
}
