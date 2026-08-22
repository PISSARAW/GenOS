const CACHE_MS = 5000;
let cache = { expiresAt: 0, models: [] };

function endpointOrigin(endpoint) {
  try { return new URL(endpoint).origin; } catch (_) { return null; }
}

function isChatCapable(model) {
  return !/(embed|embedding|rerank)/i.test(model);
}

async function readJson(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

async function discoverProvider({ provider, endpoint, modelsPath, map }) {
  const origin = endpointOrigin(endpoint);
  if (!origin) return [];
  try {
    const payload = await readJson(`${origin}${modelsPath}`);
    return map(payload).map((model) => ({ ...model, provider, endpoint, local: true, chatCapable: isChatCapable(model.model) }));
  } catch (_) { return []; }
}

async function discoverLocalModels({ force = false } = {}) {
  if (!force && cache.expiresAt > Date.now()) return cache.models;
  const targets = [
    { provider: 'lmstudio', endpoint: process.env.GENOS_LMSTUDIO_ENDPOINT || 'http://localhost:1234/v1/chat/completions', modelsPath: '/v1/models', map: (payload) => (payload.data || []).map((item) => ({ model: item.id, uri: `lmstudio://${item.id}` })) },
    { provider: 'ollama', endpoint: process.env.GENOS_OLLAMA_ENDPOINT || 'http://localhost:11434/v1/chat/completions', modelsPath: '/api/tags', map: (payload) => (payload.models || []).map((item) => ({ model: item.name, uri: `ollama://${item.name}`, size: item.size || null })) },
    { provider: 'vllm', endpoint: process.env.GENOS_VLLM_ENDPOINT || 'http://localhost:8000/v1/chat/completions', modelsPath: '/v1/models', map: (payload) => (payload.data || []).map((item) => ({ model: item.id, uri: `vllm://${item.id}` })) }
  ];
  const models = (await Promise.all(targets.map(discoverProvider))).flat();
  cache = { expiresAt: Date.now() + CACHE_MS, models };
  return models;
}

async function discoverChatModelUris(options) {
  return (await discoverLocalModels(options)).filter((model) => model.chatCapable).map((model) => model.uri);
}

module.exports = { discoverLocalModels, discoverChatModelUris };
