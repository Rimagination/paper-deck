import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  PAPERDECK_PROFILE_APP_ID,
  buildCardFavoriteId,
  buildCardFavoritePayload,
  buildScanSciLoginUrl,
  getScanSciActionItems,
  getScanSciMe,
  savePaperDeckProfile,
  toggleScanSciFavorite,
} from "./api/scansci";

const LOCAL_CARD_COLLECTION_KEY = "paperdeck:local-cards:v1";
const LOCAL_PROFILE_CACHE_PREFIX = "paperdeck:remote-profile-cache:v1";

const ScanSciAuthContext = createContext({
  status: "loading",
  user: null,
  favorites: new Set(),
  favoriteItems: [],
  favoriteItemsStatus: "idle",
  refresh: async () => null,
  loadFavoriteItems: async () => [],
  startLogin: () => {},
  isFavorite: () => false,
  getCollectedPaperIds: () => new Set(),
  toggleFavorite: async () => ({ ok: false, requiresAuth: false }),
  saveInterestProfile: async () => ({ ok: false, requiresAuth: false }),
  getPaperDeckProfile: () => null,
});

function normalizeFavorites(favorites) {
  return new Set(
    (Array.isArray(favorites) ? favorites : [])
      .map((item) => String(item?.app_id || "").trim())
      .filter(Boolean)
  );
}

function normalizeActionItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      app_id: item?.app_id || "",
      created_at: item?.created_at || "",
      payload: item?.payload || {},
    }))
    .sort((left, right) => {
      const leftTime = Date.parse(left.created_at || "") || 0;
      const rightTime = Date.parse(right.created_at || "") || 0;
      return rightTime - leftTime;
    });
}

function loadLocalCardItems() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(LOCAL_CARD_COLLECTION_KEY);
    if (!raw) return [];
    return normalizeActionItems(JSON.parse(raw));
  } catch {
    return [];
  }
}

function persistLocalCardItems(items) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_CARD_COLLECTION_KEY, JSON.stringify(items));
}

function getProfileCacheKey(userId) {
  const normalized = String(userId || "").trim();
  if (!normalized) return null;
  return `${LOCAL_PROFILE_CACHE_PREFIX}:${normalized}`;
}

function loadCachedProfileItem(userId) {
  if (typeof window === "undefined") return null;
  const cacheKey = getProfileCacheKey(userId);
  if (!cacheKey) return null;

  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.app_id !== PAPERDECK_PROFILE_APP_ID) return null;
    return {
      app_id: parsed.app_id,
      created_at: parsed.created_at || "",
      payload: parsed.payload || {},
    };
  } catch {
    return null;
  }
}

function persistCachedProfileItem(userId, item) {
  if (typeof window === "undefined") return;
  const cacheKey = getProfileCacheKey(userId);
  if (!cacheKey) return;

  if (!item) {
    window.localStorage.removeItem(cacheKey);
    return;
  }

  window.localStorage.setItem(
    cacheKey,
    JSON.stringify({
      app_id: item.app_id,
      created_at: item.created_at || "",
      payload: item.payload || {},
    })
  );
}

function mergeActionItems(...collections) {
  const merged = normalizeActionItems(collections.flat());
  const seen = new Set();
  return merged.filter((item) => {
    if (!item.app_id || seen.has(item.app_id)) return false;
    seen.add(item.app_id);
    return true;
  });
}

export function ScanSciAuthProvider({ children }) {
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);
  const [remoteFavorites, setRemoteFavorites] = useState(() => new Set());
  const [favoriteItems, setFavoriteItems] = useState([]);
  const [localFavoriteItems, setLocalFavoriteItems] = useState(() => loadLocalCardItems());
  const [cachedProfileItem, setCachedProfileItem] = useState(null);
  const [favoriteItemsStatus, setFavoriteItemsStatus] = useState("idle");
  const favoriteItemsRequestRef = useRef(null);

  async function refresh() {
    try {
      const payload = await getScanSciMe();
      setUser(payload?.user || null);
      setRemoteFavorites(normalizeFavorites(payload?.favorites));
      setStatus(payload?.user ? "authenticated" : "guest");
      return payload;
    } catch (error) {
      if (error?.response?.status === 401) {
        setUser(null);
        setRemoteFavorites(new Set());
        setFavoriteItems([]);
        setCachedProfileItem(null);
        setFavoriteItemsStatus("idle");
        setStatus("guest");
        return null;
      }
      setUser(null);
      setCachedProfileItem(null);
      setStatus("guest");
      return null;
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    persistLocalCardItems(localFavoriteItems);
  }, [localFavoriteItems]);

  useEffect(() => {
    setCachedProfileItem(loadCachedProfileItem(user?.id));
  }, [user?.id]);

  function startLogin() {
    if (typeof window === "undefined") return;
    window.location.assign(buildScanSciLoginUrl(window.location.href));
  }

  const favorites = useMemo(() => {
    const next = new Set(remoteFavorites);
    localFavoriteItems.forEach((item) => {
      if (item.app_id) next.add(item.app_id);
    });
    return next;
  }, [localFavoriteItems, remoteFavorites]);

  function isFavorite(paperOrId) {
    const appId = typeof paperOrId === "string" ? paperOrId : buildCardFavoriteId(paperOrId);
    return appId ? favorites.has(appId) : false;
  }

  function getCollectedPaperIds() {
    const ids = new Set();

    favorites.forEach((appId) => {
      if (!appId?.startsWith("paperdeck:card:")) return;
      const paperId = appId.slice("paperdeck:card:".length).trim();
      if (paperId) ids.add(paperId);
    });

    return ids;
  }

  async function loadFavoriteItems(force = false) {
    if (status !== "authenticated") {
      setFavoriteItems([]);
      setFavoriteItemsStatus("idle");
      return [];
    }

    if (!force && favoriteItemsStatus === "ready") return favoriteItems;
    if (favoriteItemsRequestRef.current) return favoriteItemsRequestRef.current;

    setFavoriteItemsStatus("loading");
    const request = (async () => {
      try {
        const payload = await getScanSciActionItems();
        const nextItems = normalizeActionItems(payload?.items);
        const nextProfileItem = nextItems.find((item) => item.app_id === PAPERDECK_PROFILE_APP_ID) || null;
        setFavoriteItems(nextItems);
        setCachedProfileItem(nextProfileItem);
        persistCachedProfileItem(user?.id, nextProfileItem);
        setFavoriteItemsStatus("ready");
        return nextItems;
      } catch (_) {
        setFavoriteItemsStatus("error");
        return [];
      } finally {
        favoriteItemsRequestRef.current = null;
      }
    })();

    favoriteItemsRequestRef.current = request;
    return request;
  }

  async function toggleFavorite(paper, tier, mode) {
    const appId = buildCardFavoriteId(paper);
    if (!appId) return { ok: false, requiresAuth: false };

    const payload = buildCardFavoritePayload(paper, tier, mode);

    if (status !== "authenticated") {
      const exists = localFavoriteItems.some((item) => item.app_id === appId);
      const nextItems = exists
        ? localFavoriteItems.filter((item) => item.app_id !== appId)
        : normalizeActionItems([
            {
              app_id: appId,
              created_at: new Date().toISOString(),
              payload,
            },
            ...localFavoriteItems,
          ]);

      setLocalFavoriteItems(nextItems);
      setFavoriteItemsStatus("ready");
      return { ok: true, isFavorite: !exists, localOnly: true };
    }

    const result = await toggleScanSciFavorite(appId, payload);

    setRemoteFavorites((current) => {
      const next = new Set(current);
      if (result?.is_favorite) {
        next.add(appId);
      } else {
        next.delete(appId);
      }
      return next;
    });

    setLocalFavoriteItems((current) => current.filter((item) => item.app_id !== appId));

    setFavoriteItems((current) => {
      if (result?.is_favorite) {
        const nextItem = {
          app_id: appId,
          created_at: new Date().toISOString(),
          payload,
        };
        return normalizeActionItems([nextItem, ...current.filter((item) => item.app_id !== appId)]);
      }
      return current.filter((item) => item.app_id !== appId);
    });

    setFavoriteItemsStatus("ready");
    return { ok: true, isFavorite: Boolean(result?.is_favorite) };
  }

  async function saveInterestProfile(profile) {
    if (status !== "authenticated") {
      return { ok: false, requiresAuth: true };
    }

    try {
      const payload = await savePaperDeckProfile(profile);
      const nextItem = {
        app_id: PAPERDECK_PROFILE_APP_ID,
        created_at: payload.updated_at,
        payload,
      };

      setFavoriteItems((current) =>
        normalizeActionItems([nextItem, ...current.filter((item) => item.app_id !== PAPERDECK_PROFILE_APP_ID)])
      );
      setCachedProfileItem(nextItem);
      persistCachedProfileItem(user?.id, nextItem);
      setFavoriteItemsStatus("ready");
      return { ok: true, payload };
    } catch (error) {
      return { ok: false, requiresAuth: false, error };
    }
  }

  function getPaperAtlasFavorites() {
    return favoriteItems.filter((item) => item.app_id?.startsWith("paperatlas:paper:"));
  }

  function getCardCollection() {
    return mergeActionItems(
      favoriteItems.filter((item) => item.app_id?.startsWith("paperdeck:card:")),
      localFavoriteItems.filter((item) => item.app_id?.startsWith("paperdeck:card:"))
    );
  }

  function getPaperDeckProfile() {
    return favoriteItems.find((item) => item.app_id === PAPERDECK_PROFILE_APP_ID) || cachedProfileItem || null;
  }

  const value = useMemo(
    () => ({
      status,
      user,
      favorites,
      favoriteItems,
      favoriteItemsStatus,
      refresh,
      loadFavoriteItems,
      startLogin,
      isFavorite,
      getCollectedPaperIds,
      toggleFavorite,
      saveInterestProfile,
      getPaperAtlasFavorites,
      getCardCollection,
      getPaperDeckProfile,
    }),
    [cachedProfileItem, favoriteItems, favoriteItemsStatus, favorites, status, user]
  );

  return <ScanSciAuthContext.Provider value={value}>{children}</ScanSciAuthContext.Provider>;
}

export function useScanSciAuth() {
  return useContext(ScanSciAuthContext);
}
