const STORAGE_KEY = "paperdeck-read-state:v1";

function loadMap() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveMap(next) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function markCardRead(paperId) {
  const normalized = String(paperId || "").trim();
  if (!normalized) return;
  const next = loadMap();
  next[normalized] = new Date().toISOString();
  saveMap(next);
}

export function getReadAt(paperId) {
  const normalized = String(paperId || "").trim();
  if (!normalized) return "";
  return loadMap()[normalized] || "";
}

export function isCardRead(paperId) {
  return Boolean(getReadAt(paperId));
}
