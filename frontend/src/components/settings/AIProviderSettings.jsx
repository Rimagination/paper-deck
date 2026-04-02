import { useState } from "react";
import {
  PRESET_PROVIDERS,
  loadProviders,
  saveProviders,
  loadActiveProviderId,
  saveActiveProviderId,
  createProvider,
} from "../../aiProviderStore";
import { useLanguage } from "../../i18n";

function maskKey(key) {
  if (!key || key.length < 8) return "••••••••";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}

function ProviderForm({ provider, onSave, onCancel, t }) {
  const isEdit = Boolean(provider);
  const [presetId, setPresetId] = useState(() => {
    if (!isEdit) return PRESET_PROVIDERS[0].presetId;
    const match = PRESET_PROVIDERS.find((p) => p.baseUrl === provider.baseUrl);
    return match ? match.presetId : "custom";
  });
  const [name, setName] = useState(provider?.name || PRESET_PROVIDERS[0].name);
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl || PRESET_PROVIDERS[0].baseUrl);
  const [model, setModel] = useState(provider?.model || PRESET_PROVIDERS[0].suggestedModels[0] || "");
  const [apiKey, setApiKey] = useState(provider?.apiKey || "");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");

  const selectedPreset = PRESET_PROVIDERS.find((p) => p.presetId === presetId);

  function handlePresetChange(id) {
    setPresetId(id);
    const preset = PRESET_PROVIDERS.find((p) => p.presetId === id);
    if (preset) {
      setName(preset.name);
      setBaseUrl(preset.baseUrl);
      setModel(preset.suggestedModels[0] || "");
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return setError(t("ai.errorName"));
    if (!baseUrl.trim()) return setError(t("ai.errorBaseUrl"));
    if (!model.trim()) return setError(t("ai.errorModel"));
    if (!apiKey.trim()) return setError(t("ai.errorApiKey"));
    setError("");
    const saved = isEdit
      ? { ...provider, name: name.trim(), baseUrl: baseUrl.trim(), model: model.trim(), apiKey: apiKey.trim() }
      : createProvider({ name: name.trim(), baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() });
    onSave(saved);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-3 mb-5">
        <button type="button" onClick={onCancel} className="ai-settings-back-btn p-1 rounded-lg">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
            <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z" clipRule="evenodd" />
          </svg>
        </button>
        <h3 className="ai-settings-subtitle type-section-title">
          {isEdit ? t("ai.editProvider") : t("ai.addProvider")}
        </h3>
      </div>

      {!isEdit && (
        <div>
          <label className="ai-settings-label type-eyebrow block mb-1.5">
            {t("ai.preset")}
          </label>
          <select
            value={presetId}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="ai-settings-input w-full rounded-lg px-3 py-2 text-sm"
          >
            {PRESET_PROVIDERS.map((p) => (
              <option key={p.presetId} value={p.presetId}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="ai-settings-label type-eyebrow block mb-1.5">
          {t("ai.providerName")}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="ai-settings-input w-full rounded-lg px-3 py-2 text-sm"
          placeholder="My OpenAI"
        />
      </div>

      <div>
        <label className="ai-settings-label type-eyebrow block mb-1.5">
          {t("ai.baseUrl")}
        </label>
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          className="ai-settings-input w-full rounded-lg px-3 py-2 text-sm font-mono"
          placeholder="https://api.openai.com/v1"
        />
      </div>

      <div>
        <label className="ai-settings-label type-eyebrow block mb-1.5">
          {t("ai.model")}
        </label>
        <input
          type="text"
          list="model-suggestions"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="ai-settings-input w-full rounded-lg px-3 py-2 text-sm font-mono"
          placeholder="gpt-4o-mini"
        />
        {selectedPreset?.suggestedModels?.length > 0 && (
          <datalist id="model-suggestions">
            {selectedPreset.suggestedModels.map((m) => <option key={m} value={m} />)}
          </datalist>
        )}
        {selectedPreset?.suggestedModels?.length > 0 && (
          <p className="mt-1 text-[10px] ai-settings-hint">
            {t("ai.modelSuggestions")}: {selectedPreset.suggestedModels.join(" / ")}
          </p>
        )}
      </div>

      <div>
        <label className="ai-settings-label type-eyebrow block mb-1.5">
          {t("ai.apiKey")}
        </label>
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="ai-settings-input w-full rounded-lg px-3 py-2 pr-10 text-sm font-mono"
            placeholder="sk-..."
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 ai-settings-hint"
            tabIndex={-1}
          >
            {showKey ? (
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" />
                <path d="M10.748 13.93l2.523 2.523a10.01 10.01 0 0 1-5.27.52 1.652 1.652 0 0 1-.857-.622 10.017 10.017 0 0 1-1.17-1.947 10.007 10.007 0 0 1-.7-3.36Z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {error && <p className="text-red-500 text-xs">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="ai-settings-cancel-btn flex-1 rounded-lg py-2"
        >
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          className="ai-settings-save-btn flex-1 rounded-lg py-2"
        >
          {t("common.save")}
        </button>
      </div>
    </form>
  );
}

export default function AIProviderSettings({ onClose }) {
  const { t } = useLanguage();
  const [providers, setProviders] = useState(loadProviders);
  const [activeId, setActiveId] = useState(loadActiveProviderId);
  const [formTarget, setFormTarget] = useState(null); // null = list, "new" = add, provider = edit

  function handleActivate(id) {
    setActiveId(id);
    saveActiveProviderId(id);
  }

  function handleDelete(id) {
    const next = providers.filter((p) => p.id !== id);
    setProviders(next);
    saveProviders(next);
    if (activeId === id) {
      setActiveId(null);
      saveActiveProviderId(null);
    }
  }

  function handleSave(provider) {
    const exists = providers.some((p) => p.id === provider.id);
    const next = exists
      ? providers.map((p) => (p.id === provider.id ? provider : p))
      : [...providers, provider];
    setProviders(next);
    saveProviders(next);
    setFormTarget(null);
  }

  const activeProvider = providers.find((p) => p.id === activeId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="ai-settings-panel mx-4 w-full max-w-sm rounded-2xl p-5 shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {formTarget !== null ? (
          <ProviderForm
            provider={formTarget === "new" ? null : formTarget}
            onSave={handleSave}
            onCancel={() => setFormTarget(null)}
            t={t}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="ai-settings-title type-section-title">{t("ai.settingsTitle")}</h2>
              <button
                onClick={onClose}
                className="ai-settings-hint rounded-lg p-1 hover:opacity-70"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>

            {/* Active provider selector */}
            <div className="space-y-1.5">
              <p className="ai-settings-label type-eyebrow">
                {t("ai.activeProvider")}
              </p>

              <button
                onClick={() => handleActivate(null)}
                className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                  activeId === null ? "ai-settings-active-row" : "ai-settings-row hover:opacity-80"
                }`}
              >
                <span className={`flex h-4 w-4 flex-none items-center justify-center rounded-full border-2 ${activeId === null ? "ai-settings-radio-on" : "ai-settings-radio-off"}`}>
                  {activeId === null && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                </span>
                <div className="min-w-0">
                  <p className="ai-settings-title type-card-title">{t("ai.serverDefault")}</p>
                  <p className="text-[10px] ai-settings-hint">{t("ai.serverDefaultDesc")}</p>
                </div>
              </button>

              {providers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleActivate(p.id)}
                  className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                    activeId === p.id ? "ai-settings-active-row" : "ai-settings-row hover:opacity-80"
                  }`}
                >
                  <span className={`flex h-4 w-4 flex-none items-center justify-center rounded-full border-2 ${activeId === p.id ? "ai-settings-radio-on" : "ai-settings-radio-off"}`}>
                    {activeId === p.id && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="ai-settings-title type-card-title truncate">{p.name}</p>
                    <p className="ai-settings-hint type-code truncate">{p.model}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Provider list with edit/delete */}
            {providers.length > 0 && (
              <div className="space-y-1.5">
                <p className="ai-settings-label type-eyebrow">
                  {t("ai.savedProviders")}
                </p>
                {providers.map((p) => (
                  <div key={p.id} className="ai-settings-card flex items-center gap-2 rounded-xl px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="ai-settings-title type-card-title truncate">{p.name}</p>
                      <p className="ai-settings-hint type-code">{maskKey(p.apiKey)}</p>
                    </div>
                    <button
                      onClick={() => setFormTarget(p)}
                      className="ai-settings-hint text-[10px] rounded-md px-2 py-1 hover:opacity-70 shrink-0"
                    >
                      {t("common.edit")}
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="text-red-400 text-[10px] rounded-md px-2 py-1 hover:opacity-70 shrink-0"
                    >
                      {t("common.delete")}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setFormTarget("new")}
              className="ai-settings-add-btn w-full rounded-xl py-2"
            >
              + {t("ai.addProvider")}
            </button>

            {/* Privacy notice */}
            <div className="ai-settings-notice flex items-start gap-2 rounded-xl px-3 py-2.5">
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 flex-none mt-0.5 ai-settings-notice-icon" fill="currentColor">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
              </svg>
              <p className="text-[10px] leading-relaxed ai-settings-notice-text">
                {t("ai.localStorageNote")}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
