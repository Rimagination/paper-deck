import { normalizeZone } from "../cards/TierBadge";

export const ZONE_ORDER = ["1\u533a", "2\u533a", "3\u533a", "4\u533a", "Unrated"];

const STOP_WORDS = new Set([
  "about",
  "across",
  "after",
  "between",
  "beyond",
  "based",
  "data",
  "driven",
  "effects",
  "from",
  "into",
  "linking",
  "model",
  "models",
  "paper",
  "papers",
  "plant",
  "plants",
  "reveal",
  "revisiting",
  "role",
  "study",
  "studies",
  "their",
  "through",
  "using",
  "with",
]);

function dedupe(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = String(value || "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractKeywordEntries(papers) {
  const counts = new Map();

  papers.forEach((paper) => {
    const source = `${paper.title || ""} ${paper.abstract || ""}`;
    const matches = source.match(/[A-Za-z][A-Za-z-]{3,}/g) || [];
    matches.forEach((rawWord) => {
      const word = rawWord.toLowerCase();
      if (STOP_WORDS.has(word)) return;
      counts.set(word, (counts.get(word) || 0) + 1);
    });
  });

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12)
    .map(([word, count]) => ({
      word: word.replace(/-/g, " "),
      count,
    }));
}

function getTopVenues(papers) {
  const counts = new Map();
  papers.forEach((paper) => {
    const venue = (paper.venue || "").trim();
    if (!venue) return;
    counts.set(venue, (counts.get(venue) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)
    .map(([name, count]) => ({ name, count }));
}

function getZoneCounts(papers) {
  const counts = new Map();
  papers.forEach((paper) => {
    const zone = normalizeZone(paper.zone) || "Unrated";
    counts.set(zone, (counts.get(zone) || 0) + 1);
  });

  return ZONE_ORDER.map((zone) => ({
    zone,
    count: counts.get(zone) || 0,
  })).filter((entry) => entry.count > 0);
}

function getDominantZone(zoneCounts) {
  const ranked = [...zoneCounts].sort((left, right) => right.count - left.count);
  if (!ranked[0] || ranked[0].zone === "Unrated") return null;
  return ranked[0].zone;
}

function getHeadline(keywordEntries, papers) {
  if (keywordEntries.length > 0) {
    return keywordEntries.slice(0, 3).map((entry) => entry.word).join(" / ");
  }

  const venue = papers.find((paper) => paper.venue)?.venue;
  return venue || "Interest memory";
}

function getEchoes(keywordEntries, venues) {
  return dedupe([
    ...keywordEntries.slice(0, 4).map((entry) => entry.word),
    ...venues.slice(0, 2).map((entry) => entry.name),
  ]).slice(0, 6);
}

export function buildInterestMemory(profileInfo) {
  const papers = Array.isArray(profileInfo?.seed_papers) ? profileInfo.seed_papers.filter(Boolean) : [];
  const years = papers.map((paper) => paper.year).filter((year) => Number.isFinite(year));
  const citations = papers.map((paper) => paper.citation_count || 0);
  const keywordEntries = extractKeywordEntries(papers);
  const venues = getTopVenues(papers);
  const zoneCounts = getZoneCounts(papers);
  const yearMin = years.length > 0 ? Math.min(...years) : null;
  const yearMax = years.length > 0 ? Math.max(...years) : null;
  const avgCitations = citations.length > 0
    ? Math.round(citations.reduce((sum, value) => sum + value, 0) / citations.length)
    : 0;

  return {
    papers,
    keywordEntries,
    venues,
    zoneCounts,
    dominantZone: getDominantZone(zoneCounts),
    headline: getHeadline(keywordEntries, papers),
    yearMin,
    yearMax,
    avgCitations,
    echoes: getEchoes(keywordEntries, venues),
  };
}
