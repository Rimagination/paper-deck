const PROVIDERS_KEY = "paper-deck-ai-providers";
const ACTIVE_KEY = "paper-deck-ai-active";

export const PRESET_PROVIDERS = [
  {
    presetId: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    suggestedModels: ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
  },
  {
    presetId: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    suggestedModels: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    presetId: "siliconflow",
    name: "SiliconFlow",
    baseUrl: "https://api.siliconflow.cn/v1",
    suggestedModels: ["deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct", "THUDM/glm-4-9b-chat"],
  },
  {
    presetId: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    suggestedModels: ["openai/gpt-4o-mini", "anthropic/claude-3-haiku", "google/gemini-flash-1.5"],
  },
  {
    presetId: "zhipu",
    name: "Zhipu GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    suggestedModels: ["glm-4-flash", "glm-4"],
  },
  {
    presetId: "moonshot",
    name: "Moonshot Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    suggestedModels: ["moonshot-v1-8k", "moonshot-v1-32k"],
  },
  {
    presetId: "qiniu",
    name: "Qiniu StepFun",
    baseUrl: "https://api.qnaigc.com/v1",
    suggestedModels: ["stepfun/step-3.5-flash", "stepfun/step-2-16k"],
  },
  {
    presetId: "custom",
    name: "Custom",
    baseUrl: "",
    suggestedModels: [],
  },
];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function loadProviders() {
  try {
    const raw = localStorage.getItem(PROVIDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveProviders(providers) {
  localStorage.setItem(PROVIDERS_KEY, JSON.stringify(providers));
}

export function loadActiveProviderId() {
  return localStorage.getItem(ACTIVE_KEY) || null;
}

export function saveActiveProviderId(id) {
  if (id === null) {
    localStorage.removeItem(ACTIVE_KEY);
  } else {
    localStorage.setItem(ACTIVE_KEY, id);
  }
}

export function createProvider({ name, baseUrl, apiKey, model }) {
  return { id: generateId(), name, baseUrl, apiKey, model };
}

export function getActiveProviderConfig() {
  const activeId = loadActiveProviderId();
  if (!activeId) return null;
  const providers = loadProviders();
  const found = providers.find((p) => p.id === activeId);
  if (!found) return null;
  return { base_url: found.baseUrl, api_key: found.apiKey, model: found.model };
}
