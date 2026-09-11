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

function mapItemsToModels(payload, provider) {
  const list = Array.isArray(payload && payload.data) ? payload.data : [];
  return list.map((item) => ({ model: item.id, uri: `${provider}://${item.id}` }));
}

function mapOllamaModels(payload) {
  const list = Array.isArray(payload && payload.models) ? payload.models : [];
  return list
    .filter((item) => item && item.name && isChatCapable(item.name))
    .map((item) => ({ model: item.name, uri: `ollama://${item.name}`, size: item.size || null }));
}

function getDiscoveryTargets() {
  const host = process.env.GENOS_LOCAL_HOST || 'localhost';
  const lmPort = process.env.GENOS_LMSTUDIO_PORT || '1234';
  const olPort = process.env.GENOS_OLLAMA_PORT || '11434';
  const vlPort = process.env.GENOS_VLLM_PORT || '8000';

  return [
    {
      provider: 'lmstudio',
      endpoint: process.env.GENOS_LMSTUDIO_ENDPOINT || `http://${host}:${lmPort}/v1/chat/completions`,
      modelsPath: '/v1/models',
      map: (payload) => mapItemsToModels(payload, 'lmstudio')
    },
    {
      provider: 'ollama',
      endpoint: process.env.GENOS_OLLAMA_ENDPOINT || `http://${host}:${olPort}/v1/chat/completions`,
      modelsPath: '/api/tags',
      map: mapOllamaModels
    },
    {
      provider: 'vllm',
      endpoint: process.env.GENOS_VLLM_ENDPOINT || `http://${host}:${vlPort}/v1/chat/completions`,
      modelsPath: '/v1/models',
      map: (payload) => mapItemsToModels(payload, 'vllm')
    },
    {
      provider: 'openai-compatible',
      endpoint: process.env.GENOS_OPENAI_COMPATIBLE_ENDPOINT || process.env.GENOS_MODEL_ENDPOINT,
      modelsPath: '/v1/models',
      map: (payload) => mapItemsToModels(payload, 'openai-compatible')
    }
  ];
}

function isCacheValid(cacheKey, force) {
  if (force) return false;
  if (cache.key !== cacheKey) return false;
  return cache.expiresAt > Date.now();
}

async function discoverLocalModels({ force = false } = {}) {
  const targets = getDiscoveryTargets();
  const cacheKey = targets.map((target) => `${target.provider}:${target.endpoint || ''}`).join('|');
  if (isCacheValid(cacheKey, force)) return cache.models;

  const activeTargets = targets.filter((target) => Boolean(target.endpoint));
  const results = await Promise.all(activeTargets.map(discoverProvider));
  const models = results.flatMap((result) => result.models || []);
  const errors = results.flatMap((result) => result.error ? [result.error] : []);
  const ttl = errors.length > 0 ? ERROR_CACHE_MS : CACHE_MS;
  cache = { expiresAt: Date.now() + ttl, key: cacheKey, models, errors };
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
