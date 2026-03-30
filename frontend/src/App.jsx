import { lazy, Suspense, useEffect, useState } from "react";
import { useScanSciAuth } from "./auth";
import { useLanguage } from "./i18n";
import { useTheme } from "./theme";
import SeedView from "./components/seeds/SeedView";
import LibraryView from "./components/library/LibraryView";
import DrawView from "./components/gacha/DrawView";
import CardDetail from "./components/cards/CardDetail";
import SubscriptionView from "./components/subscriptions/SubscriptionView";
import { loadStoredSubscriptions, saveStoredSubscriptions } from "./subscriptionsStore";
import { loadActiveProviderId } from "./aiProviderStore";

const AIProviderSettings = lazy(() => import("./components/settings/AIProviderSettings"));

const OTHER_APPS = [
  { name: "Paper Atlas", url: "https://paperatlas.scansci.com" },
  { name: "DataRaven", url: "https://dataset.scansci.com" },
  { name: "Journal Scout", url: "https://journal.scansci.com" },
];

function ScanSciGlobalNav() {
  return (
    <nav className="global-nav fixed left-0 right-0 top-0 z-[60] flex h-10 items-center justify-between px-3 backdrop-blur-md sm:px-5">
      <a href="https://www.scansci.com" className="global-nav-brand flex items-center gap-1.5 text-[12px] font-bold">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 flex-none" fill="currentColor">
          <path d="M6.5 1.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10M0 6.5a6.5 6.5 0 1 1 11.598 4.036l3.433 3.433-1.06 1.06-3.434-3.432A6.5 6.5 0 0 1 0 6.5" />
        </svg>
        ScanSci
      </a>
      <div className="flex items-center gap-0.5">
        {OTHER_APPS.map((app) => (
          <a key={app.name} href={app.url} className="global-nav-link rounded-md px-2.5 py-1 text-[11px] font-medium">
            {app.name}
          </a>
        ))}
      </div>
    </nav>
  );
}

function ViewTabs({ view, onViewChange, t, locale }) {
  const labels =
    locale === "zh"
      ? {
          seeds: "发现",
          draw: "抽卡",
          subscriptions: "订阅",
          library: "卡库",
        }
      : {
          seeds: "Discover",
          draw: "Draw",
          subscriptions: "Subscriptions",
          library: "Library",
        };

  const tabs = [
    { key: "seeds", label: labels.seeds || t("nav.seeds") },
    { key: "draw", label: labels.draw || t("nav.draw") },
    { key: "subscriptions", label: labels.subscriptions || t("nav.subscriptions") },
    { key: "library", label: labels.library || t("nav.library") },
  ];

  return (
    <div className="app-tabs flex items-center gap-1 rounded-xl p-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onViewChange(tab.key)}
          className={`app-tab rounded-lg px-4 py-2 text-sm font-medium ${view === tab.key ? "is-active" : ""}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function AuthButton({ authStatus, user, onLogin, t }) {
  if (authStatus === "loading") {
    return <span className="text-xs text-slate-400">{t("auth.checking")}</span>;
  }

  if (authStatus === "authenticated") {
    return (
      <span className="flex items-center gap-2 text-xs text-slate-600">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        {user?.login || t("auth.synced")}
      </span>
    );
  }

  return (
    <button onClick={onLogin} className="app-primary-button rounded-lg px-3 py-1.5 text-xs font-medium">
      {t("auth.signIn")}
    </button>
  );
}

function ThemeToggle({ theme, onToggle, t }) {
  const isDark = theme === "dark";

  return (
    <button
      onClick={onToggle}
      className="app-theme-toggle"
      aria-label={`${t("theme.switchLabel")}: ${isDark ? t("theme.dark") : t("theme.light")}`}
      title={`${t("theme.switchLabel")}: ${isDark ? t("theme.dark") : t("theme.light")}`}
    >
      <span className="app-theme-icon" aria-hidden="true">
        {isDark ? (
          <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" />
          </svg>
        )}
      </span>
    </button>
  );
}

export default function App() {
  const { t, locale, setLocale } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { status: authStatus, user: authUser, startLogin } = useScanSciAuth();

  const [view, setView] = useState("seeds");
  const [seedPapers, setSeedPapers] = useState([]);
  const [seedPaperIds, setSeedPaperIds] = useState([]);
  const [profileReady, setProfileReady] = useState(false);
  const [interestProfile, setInterestProfile] = useState(null);
  const [subscribedVenues, setSubscribedVenues] = useState(() => loadStoredSubscriptions());
  const [detailCard, setDetailCard] = useState(null);
  const [cardMode, setCardMode] = useState("research");
  const [showAiSettings, setShowAiSettings] = useState(false);

  useEffect(() => {
    saveStoredSubscriptions(subscribedVenues);
  }, [subscribedVenues]);

  function handleProfileGenerated(paperIds, profile) {
    const nextSeedPapers = profile?.seed_papers || seedPapers;
    const nextSeedIds = Array.isArray(nextSeedPapers)
      ? nextSeedPapers.map((paper) => paper?.paper_id).filter(Boolean)
      : paperIds;

    setSeedPapers(nextSeedPapers);
    setSeedPaperIds(nextSeedIds.length > 0 ? nextSeedIds : paperIds);
    setProfileReady(true);
    if (profile) setInterestProfile(profile);
  }

  function handleSeedsUpdated(nextSeeds) {
    setSeedPapers(nextSeeds);
    setSeedPaperIds(nextSeeds.map((paper) => paper.paper_id));
    setProfileReady(false);
    setInterestProfile(null);
  }

  return (
    <div className="app-shell min-h-screen overflow-x-hidden">
      <ScanSciGlobalNav />
      <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-4 pt-10">
        <header className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="flex min-w-0 items-center gap-4">
            <h1 className="app-wordmark font-heading text-xl font-bold">PaperDeck</h1>
            <ViewTabs view={view} onViewChange={setView} t={t} locale={locale} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="app-segmented flex items-center gap-1 rounded-lg p-0.5">
              <button
                onClick={() => setCardMode("research")}
                className={`app-segment-button rounded-md px-2.5 py-1 text-[11px] font-medium ${
                  cardMode === "research" ? "is-active" : ""
                }`}
              >
                {t("card.researchMode")}
              </button>
              <button
                onClick={() => setCardMode("discovery")}
                className={`app-segment-button rounded-md px-2.5 py-1 text-[11px] font-medium ${
                  cardMode === "discovery" ? "is-active" : ""
                }`}
              >
                {t("card.discoveryMode")}
              </button>
            </div>
            <ThemeToggle theme={theme} onToggle={toggleTheme} t={t} />
            <button
              onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
              className="app-locale-button rounded-lg px-2.5 py-1.5 text-[11px] font-medium"
            >
              {locale === "zh" ? "EN" : "中文"}
            </button>
            <button
              onClick={() => setShowAiSettings(true)}
              className="app-ai-settings-btn relative rounded-lg px-2 py-1.5"
              title={t("ai.settingsTitle")}
              aria-label={t("ai.settingsTitle")}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251L2.98 9.934a7.05 7.05 0 0 1 0-2.228L1.713 6.593a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.993 6.993 0 0 1 7.51 2.455l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
              </svg>
              {loadActiveProviderId() && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400" />
              )}
            </button>
            <AuthButton authStatus={authStatus} user={authUser} onLogin={startLogin} t={t} />
          </div>
        </header>

        <main className="flex-1 pb-8">
          {view === "seeds" && (
            <SeedView
              initialSeeds={seedPapers}
              initialProfile={interestProfile}
              subscribedVenues={subscribedVenues}
              cardMode={cardMode}
              onProfileGenerated={handleProfileGenerated}
              onSeedsUpdated={handleSeedsUpdated}
              onOpenDraw={() => setView("draw")}
              onOpenSubscriptions={() => setView("subscriptions")}
              onViewCard={setDetailCard}
            />
          )}
          {view === "draw" && (
            <DrawView
              profileInfo={interestProfile}
              profileReady={profileReady}
              seedPaperIds={seedPaperIds}
              cardMode={cardMode}
              onOpenDiscover={() => setView("seeds")}
              onViewCard={setDetailCard}
            />
          )}
          {view === "library" && <LibraryView cardMode={cardMode} onViewCard={setDetailCard} />}
          {view === "subscriptions" && (
            <SubscriptionView
              profileInfo={interestProfile}
              profileReady={profileReady}
              seedPaperIds={seedPaperIds}
              subscribedVenues={subscribedVenues}
              onSubscriptionsChange={setSubscribedVenues}
              onViewCard={setDetailCard}
            />
          )}
        </main>
      </div>

      {detailCard && <CardDetail card={detailCard} mode={cardMode} onClose={() => setDetailCard(null)} />}

      {showAiSettings && (
        <Suspense fallback={null}>
          <AIProviderSettings onClose={() => setShowAiSettings(false)} />
        </Suspense>
      )}
    </div>
  );
}
