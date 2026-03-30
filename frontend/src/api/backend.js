import axios from "axios";
import { getActiveProviderConfig } from "../aiProviderStore";

function resolveApiBaseUrl() {
  const env = import.meta.env || {};

  if (env.VITE_API_BASE_URL) {
    return env.VITE_API_BASE_URL.replace(/\/+$/, "");
  }
  if (env.DEV) {
    return "http://localhost:8004/api";
  }
  return "/api";
}

function isPaperSummary(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.paper_id === "string" &&
      value.paper_id.trim().length > 0
  );
}

function validatePaperSummary(value) {
  if (!isPaperSummary(value)) {
    throw new Error("Invalid paper summary response.");
  }
  return value;
}

function validatePaperSummaryList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(isPaperSummary);
}

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 30000,
});

export async function searchSeeds(query) {
  const response = await api.post("/seeds/search", { query });
  return validatePaperSummaryList(response.data);
}

export async function resolveSeed(paperId, doi, input) {
  const params = {};
  if (paperId) params.paper_id = paperId;
  if (doi) params.doi = doi;
  if (input) params.input = input;
  const response = await api.get("/seeds/resolve", { params });
  return validatePaperSummary(response.data);
}

export async function resolveSeedInput(input) {
  return resolveSeed(null, null, input);
}

export async function generateProfile(paperIds, seedPapers = []) {
  const response = await api.post("/profile/generate", {
    paper_ids: paperIds,
    seed_papers: Array.isArray(seedPapers) ? seedPapers : [],
  });
  return response.data;
}

export async function getRecommendations(seedPaperIds, limit = 20, yearMin = null, excludePaperIds = [], language = "zh") {
  const response = await api.post("/recommend", {
    seed_paper_ids: seedPaperIds,
    limit,
    year_min: yearMin,
    exclude_paper_ids: excludePaperIds,
    language,
  });
  return response.data;
}

export async function gachaDraw(
  seedPaperIds,
  count = 5,
  mode = "research",
  language = "zh",
  excludePaperIds = [],
  seedPapers = []
) {
  const body = {
    seed_paper_ids: seedPaperIds,
    seed_papers: seedPapers,
    count,
    mode,
    language,
    exclude_paper_ids: excludePaperIds,
  };
  const aiProvider = getActiveProviderConfig();
  if (aiProvider) body.ai_provider = aiProvider;
  const response = await api.post("/recommend/gacha", body, { timeout: 120000 });
  return response.data;
}

export async function generateCard(paperId, mode = "research", language = "zh") {
  const body = { paper_id: paperId, mode, language };
  const aiProvider = getActiveProviderConfig();
  if (aiProvider) body.ai_provider = aiProvider;
  const response = await api.post("/cards/generate", body);
  return response.data;
}

export async function searchVenues(query) {
  const response = await api.get("/subscriptions/venues/search", { params: { q: query, limit: 10 } });
  return Array.isArray(response.data) ? response.data : [];
}

export async function getSubscriptionFeed({
  venueIds,
  interestEmbedding,
  daysBack = 30,
  minSimilarity = 0,
  limit = 20,
  excludePaperIds = [],
  language = "zh",
}) {
  const response = await api.post("/subscriptions/feed", {
    venue_ids: venueIds,
    interest_embedding: interestEmbedding,
    days_back: daysBack,
    min_similarity: minSimilarity,
    limit,
    exclude_paper_ids: excludePaperIds,
    language,
  });
  return validatePaperSummaryList(response.data?.papers || []);
}

export default api;
