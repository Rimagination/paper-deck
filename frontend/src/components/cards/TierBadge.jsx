const CAS_ZONE_MAP = {
  "\u0031\u533a": "SSR",
  "\u0032\u533a": "SR",
  "\u0033\u533a": "R",
  "\u0034\u533a": "N",
};

const LEGACY_ZONE_MAP = {
  SSR: "\u0031\u533a",
  SR: "\u0032\u533a",
  R: "\u0033\u533a",
  N: "\u0034\u533a",
};

export const ZONE_CONFIG = {
  "\u0031\u533a": {
    cardClass: "card-zone-1",
    badgeClass:
      "bg-gradient-to-br from-amber-300 to-yellow-500 text-amber-950 shadow-lg shadow-amber-500/50",
    titleColor: "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]",
    titleSecondaryColor: "text-amber-50/86",
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
  "\u0032\u533a": {
    cardClass: "card-zone-2",
    badgeClass:
      "bg-gradient-to-br from-violet-200 to-fuchsia-300 text-violet-950 shadow-lg shadow-violet-400/40",
    titleColor: "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]",
    titleSecondaryColor: "text-violet-50/86",
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
  "\u0033\u533a": {
    cardClass: "card-zone-3",
    badgeClass:
      "bg-gradient-to-br from-sky-300 to-blue-500 text-blue-950 shadow-lg shadow-blue-500/40",
    titleColor: "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]",
    titleSecondaryColor: "text-sky-50/86",
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
  "\u0034\u533a": {
    cardClass: "card-zone-4",
    badgeClass:
      "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900 shadow-lg shadow-slate-500/35",
    titleColor: "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]",
    titleSecondaryColor: "text-slate-100/88",
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
    titleSecondaryColor: "text-slate-700",
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

const NI_THEME_OVERRIDES = {
  cardClass: "card-zone-ni",
  badgeClass:
    "bg-gradient-to-br from-amber-200 via-yellow-300 to-amber-500 text-amber-950 shadow-lg shadow-amber-500/60",
  titleColor: "text-[#f6d46d]",
  titleSecondaryColor: "text-[rgba(244,220,149,0.92)]",
  authorColor: "text-[rgba(244,232,202,0.88)]",
  labelColor: "text-[rgba(245,230,191,0.78)]",
  bodyColor: "text-[rgba(244,232,202,0.96)]",
  tagClass: "bg-amber-950/76 text-amber-50 border border-amber-400/38",
  insightClass: "bg-amber-950/82 text-amber-50 border border-amber-300/32",
  dividerClass: "border-amber-100/18",
  citationClass: "text-[rgba(244,232,202,0.88)]",
  matchClass: "bg-amber-950/78 text-amber-50 border border-amber-300/38",
  doiClass: "text-[#f6d46d] hover:text-[#ffe9a6]",
  loaderRingClass: "border-yellow-100/78",
  loaderCoreClass: "bg-yellow-50",
};

export function normalizeZone(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  if (ZONE_CONFIG[raw]) return raw;
  return LEGACY_ZONE_MAP[raw] || null;
}

export function getZoneLabel(value) {
  const zone = normalizeZone(value);
  return zone ? CAS_ZONE_MAP[zone] : "Unrated";
}

export function getTierConfig(value, options = {}) {
  const zone = normalizeZone(value);
  const base = ZONE_CONFIG[zone] || ZONE_CONFIG.default;
  if (options.isNi) {
    return { ...base, ...NI_THEME_OVERRIDES };
  }
  return base;
}

export function getTierStyles(value, options = {}) {
  const config = getTierConfig(value, options);
  return { border: config.cardClass, bg: "", badge: config.badgeClass };
}

export default function TierBadge({ zone, tier, size = "md", isNi = false }) {
  const value = zone ?? tier;
  const config = getTierConfig(value, { isNi });
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
