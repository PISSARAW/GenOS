const CACHE_MS = 5000;
const ERROR_CACHE_MS = 500;
const { validateProviderEndpoint } = require('./providerEndpointPolicy');
let cache = { expiresAt: 0, key: '', models: [], errors: [] };

function endpointBase(endpoint) {
  try {
    const url = new URL(endpoint);
    const strippedPath = url.pathname.replace(/\/v1\/chat\/completions\/?$/, '').replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '');
    return `${url.origin}${strippedPath}`;
  } catch (_) { return null; }
}

function isChatCapable(model) {
  return !/(embed|embedding|rerank)/i.test(model);
}

async function readJson(url, timeoutMs = Number(process.env.GENOS_MODEL_DISCOVERY_TIMEOUT_MS) || 2500) {
  let lastError;
  const attempts = Math.max(1, Number(process.env.GENOS_MODEL_DISCOVERY_RETRIES) || 2);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    } finally { clearTimeout(timer); }
  }
  throw lastError;
}

async function discoverProvider({ provider, endpoint, modelsPath, map }) {
  try { validateProviderEndpoint(endpoint, { localOnly: true }); } catch (error) { return { models: [], error: `${provider} discovery rejected: ${error.message}` }; }
  const base = endpointBase(endpoint);
  if (!base) return { models: [], error: `Invalid ${provider} endpoint.` };
  try {
    const payload = await readJson(`${base}${modelsPath}`);
    return { models: map(payload).map((model) => ({ ...model, provider, endpoint, local: true, chatCapable: isChatCapable(model.model) })) };
  } catch (error) { return { models: [], error: `${provider} discovery failed: ${error.message}` }; }
}

async function discoverLocalModels({ force = false } = {}) {
  const targets = [
    { provider: 'lmstudio', endpoint: process.env.GENOS_LMSTUDIO_ENDPOINT || 'http://localhost:1234/v1/chat/completions', modelsPath: '/v1/models', map: (payload) => (payload.data || []).map((item) => ({ model: item.id, uri: `lmstudio://${item.id}` })) },
    { provider: 'ollama', endpoint: process.env.GENOS_OLLAMA_ENDPOINT || 'http://localhost:11434/v1/chat/completions', modelsPath: '/api/tags', map: (payload) => (payload.models || []).filter(item => item.name && !/(embed|embedding|rerank)/i.test(item.name)).map((item) => ({ model: item.name, uri: `ollama://${item.name}`, size: item.size || null })) },
    { provider: 'vllm', endpoint: process.env.GENOS_VLLM_ENDPOINT || 'http://localhost:8000/v1/chat/completions', modelsPath: '/v1/models', map: (payload) => (payload.data || []).map((item) => ({ model: item.id, uri: `vllm://${item.id}` })) },
    { provider: 'openai-compatible', endpoint: process.env.GENOS_OPENAI_COMPATIBLE_ENDPOINT || process.env.GENOS_MODEL_ENDPOINT, modelsPath: '/v1/models', map: (payload) => (payload.data || []).map((item) => ({ model: item.id, uri: `openai-compatible://${item.id}` })) }
  ];
  const cacheKey = targets.map((target) => `${target.provider}:${target.endpoint || ''}`).join('|');
  if (!force && cache.key === cacheKey && cache.expiresAt > Date.now()) return cache.models;
  const results = await Promise.all(targets.filter((target) => target.endpoint).map(discoverProvider));
  const models = results.flatMap((result) => result.models || []);
  const errors = results.flatMap((result) => result.error ? [result.error] : []);
  cache = { expiresAt: Date.now() + (errors.length ? ERROR_CACHE_MS : CACHE_MS), key: cacheKey, models, errors };
  return models;
}

async function discoverChatModelUris(options) {
  return (await discoverLocalModels(options)).filter((model) => model.chatCapable).map((model) => model.uri);
}

function endpointForModel(uri) {
  return cache.models.find((model) => model.uri === uri)?.endpoint || null;
}

function discoveryErrors() { return cache.errors || []; }

module.exports = { discoverLocalModels, discoverChatModelUris, endpointForModel, discoveryErrors };
