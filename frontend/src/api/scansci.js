import axios from "axios";

function ensureApiSuffix(url) {
  const normalized = url.replace(/\/+$/, "");
  return normalized.endsWith("/api") ? normalized : `${normalized}/api`;
}

function resolveScanSciApiBaseUrl() {
  if (import.meta.env.VITE_SCANSCI_API_BASE_URL) {
    return ensureApiSuffix(import.meta.env.VITE_SCANSCI_API_BASE_URL);
  }
  return "https://www.scansci.com/api";
}

const scansciClient = axios.create({
  baseURL: resolveScanSciApiBaseUrl(),
  timeout: 15000,
  withCredentials: true,
});

export const PAPERDECK_PROFILE_APP_ID = "paperdeck:profile:v1";

// PaperDeck uses "paperdeck:" prefix for its own data
export function buildCardFavoriteId(paper) {
  const identifier = paper?.paper_id || paper?.id || paper?.paperId;
  if (!identifier) return null;
  return `paperdeck:card:${String(identifier).trim()}`;
}

export function buildCardFavoritePayload(paper, tier, mode) {
  return {
    paper_id: paper?.paper_id || paper?.paperId || null,
    title: paper?.title || "",
    authors: Array.isArray(paper?.authors) ? paper.authors : [],
    year: paper?.year ?? null,
    venue: paper?.venue || null,
    doi: paper?.doi || null,
    url: paper?.url || null,
    citation_count: paper?.citation_count ?? paper?.citationCount ?? 0,
    similarity_score: paper?.similarity_score ?? 0,
    tier: tier || "N",
    zone: paper?.zone || null,
    issn: paper?.issn || null,
    eissn: paper?.eissn || null,
    mode: mode || "research",
    card_content: paper?.card_content || null,
    source: "paper_deck",
  };
}

export function buildInterestProfilePayload(profile) {
  const seedPapers = Array.isArray(profile?.seed_papers) ? profile.seed_papers : [];
  return {
    version: 1,
    embedding: Array.isArray(profile?.embedding) ? profile.embedding : [],
    seed_count: profile?.seed_count ?? seedPapers.length,
    seed_papers: seedPapers,
    seed_paper_ids: seedPapers.map((paper) => paper.paper_id).filter(Boolean),
    updated_at: profile?.updated_at || new Date().toISOString(),
    source: "paper_deck",
  };
}

export function buildScanSciLoginUrl(returnTo) {
  const base = resolveScanSciApiBaseUrl().replace(/\/api$/, "");
  const url = new URL("/api/auth/github/start", base);
  url.searchParams.set("return_to", returnTo);
  return url.toString();
}

export async function getScanSciMe() {
  const response = await scansciClient.get("/me");
  return response.data;
}

export async function getScanSciActionItems(options = null) {
  let params = undefined;

  if (typeof options === "string" && options.trim()) {
    params = { type: options.trim() };
  } else if (options && typeof options === "object") {
    const nextParams = {};
    if (typeof options.type === "string" && options.type.trim()) nextParams.type = options.type.trim();
    if (typeof options.appId === "string" && options.appId.trim()) nextParams.app_id = options.appId.trim();
    if (typeof options.actionType === "string" && options.actionType.trim()) {
      nextParams.action_type = options.actionType.trim();
    }
    if (Number.isFinite(options.limit)) nextParams.limit = options.limit;
    if (Object.keys(nextParams).length > 0) params = nextParams;
  }

  const response = await scansciClient.get("/actions", {
    params,
  });
  return response.data;
}

export async function getScanSciFavoriteItems() {
  return getScanSciActionItems("favorite");
}

export async function getScanSciLatestActionItem(appId, actionType = null) {
  const response = await scansciClient.get("/actions", {
    params: {
      app_id: appId,
      ...(actionType ? { action_type: actionType } : {}),
      limit: 1,
    },
    timeout: 6000,
  });

  const items = Array.isArray(response.data?.items) ? response.data.items : [];
  return items[0] || null;
}

export async function toggleScanSciFavorite(appId, payload) {
  const response = await scansciClient.post("/actions", {
    app_id: appId,
    action_type: "favorite_toggle",
    payload,
  });
  return response.data;
}

export async function saveScanSciAction(appId, actionType, payload) {
  const response = await scansciClient.post("/actions", {
    app_id: appId,
    action_type: actionType,
    payload,
  });
  return response.data;
}

export async function savePaperDeckProfile(profile) {
  const payload = buildInterestProfilePayload(profile);
  const result = await saveScanSciAction(PAPERDECK_PROFILE_APP_ID, "profile_upsert", payload);
  return { ...payload, ...(result || {}) };
}

export default scansciClient;
