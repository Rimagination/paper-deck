const STORAGE_KEY = "paperdeck:subscriptions:v1";

function normalizeVenue(venue) {
  if (!venue || typeof venue !== "object") return null;

  const id = String(venue.id || "").trim();
  const name = String(venue.name || "").trim();
  if (!id || !name) return null;

  return {
    id,
    name,
    type: venue.type || "",
    works_count: Number(venue.works_count || 0),
    issn: venue.issn || null,
    url: venue.url || null,
    zone: venue.zone || null,
  };
}

export function loadStoredSubscriptions() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeVenue).filter(Boolean);
  } catch {
    return [];
  }
}

export function saveStoredSubscriptions(venues) {
  if (typeof window === "undefined") return;

  const normalized = Array.isArray(venues) ? venues.map(normalizeVenue).filter(Boolean) : [];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}
