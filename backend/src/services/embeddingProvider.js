const { validateProviderEndpoint } = require('./providerEndpointPolicy');

function cosine(a = [], b = []) {
  const n = Math.min(a.length, b.length);
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? dot / (Math.sqrt(aa) * Math.sqrt(bb)) : 0;
}

function normalizeVector(vec = [], targetDim = 768) {
  if (!Array.isArray(vec) || !vec.length) return null;
  if (targetDim && vec.length !== targetDim) return null;
  const adjusted = vec;
  let sum = 0;
  for (let i = 0; i < adjusted.length; i++) sum += adjusted[i] * adjusted[i];
  const norm = Math.sqrt(sum);
  if (norm > 0) {
    return adjusted.map(v => v / norm);
  }
  return adjusted;
}

async function embedWithOpenAi(text, apiKey, { endpoint, model }) {
  const url = endpoint || 'https://api.openai.com/v1/embeddings';
  validateProviderEndpoint(url);
  const embeddingModel = model || 'text-embedding-3-small';
  const targetDim = Number(process.env.GENOS_EMBEDDING_DIMENSIONS) || 768;
  const body = { model: embeddingModel, input: text };
  if (embeddingModel.startsWith('text-embedding-3')) {
    body.dimensions = targetDim;
  }
  const timeoutMs = Number(process.env.GENOS_EMBEDDING_TIMEOUT_MS) || 5000;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const rawVec = payload?.data?.[0]?.embedding || null;
  return normalizeVector(rawVec, targetDim);
}

async function embedWithGemini(text, apiKey, model) {
  const embeddingModel = model || 'text-embedding-004';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${embeddingModel}:embedContent`;
  const timeoutMs = Number(process.env.GENOS_EMBEDDING_TIMEOUT_MS) || 5000;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      model: `models/${embeddingModel}`,
      content: { parts: [{ text }] }
    }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const rawVec = payload?.embedding?.values || null;
  const targetDim = Number(process.env.GENOS_EMBEDDING_DIMENSIONS) || 768;
  return normalizeVector(rawVec, targetDim);
}

async function tryOllamaModernEndpoint(params) {
  const { base, text, model, timeoutMs, targetDim } = params;
  const embedUrl = base.endsWith('/api/embed') ? base : `${base}/api/embed`;
  const response = await fetch(embedUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: text }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const rawVec = payload?.embeddings?.[0] || null;
  if (rawVec) return normalizeVector(rawVec, targetDim);
  return null;
}

async function tryOllamaLegacyEndpoint(params) {
  const { base, text, model, timeoutMs, targetDim } = params;
  const legacyUrl = base.endsWith('/api/embeddings') ? base : `${base}/api/embeddings`;
  const response = await fetch(legacyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: text }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const rawVec = payload?.embedding || null;
  if (rawVec) return normalizeVector(rawVec, targetDim);
  return null;
}

async function embedWithOllama(text, rawUrl, model) {
  const base = rawUrl.replace(/\/+$/, '');
  validateProviderEndpoint(base, { localOnly: true });
  const targetDim = Number(process.env.GENOS_EMBEDDING_DIMENSIONS) || 768;
  const timeoutMs = Number(process.env.GENOS_EMBEDDING_TIMEOUT_MS) || 4000;

  const params = { base, text, model, timeoutMs, targetDim };
  const modernResult = await tryOllamaModernEndpoint(params);
  if (modernResult) return modernResult;

  const legacyResult = await tryOllamaLegacyEndpoint(params);
  if (legacyResult) return legacyResult;

  return null;
}

function buildEmbedConfig() {
  return {
    ollamaUrl: process.env.GENOS_EMBEDDING_URL ||
      process.env.GENOS_OLLAMA_URL ||
      process.env.OLLAMA_HOST ||
      'http://127.0.0.1:11434',
    ollamaModel: process.env.GENOS_EMBEDDING_MODEL ||
      process.env.OLLAMA_EMBEDDING_MODEL ||
      'nomic-embed-text'
  };
}

async function tryOpenAiEmbed(text) {
  const openAiKey = process.env.GENOS_EMBEDDING_API_KEY || process.env.OPENAI_API_KEY;
  const provider = process.env.GENOS_EMBEDDING_PROVIDER;
  if ((provider === 'openai' || (!provider && openAiKey)) && openAiKey) {
    try {
      const vec = await embedWithOpenAi(text, openAiKey, {
        endpoint: process.env.GENOS_EMBEDDING_URL,
        model: process.env.GENOS_EMBEDDING_MODEL
      });
      if (vec) return vec;
    } catch (_) {}
  }
  return null;
}

async function tryGeminiEmbed(text) {
  if (process.env.GENOS_EMBEDDING_PROVIDER !== 'gemini') return null;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GENOS_EMBEDDING_API_KEY;
  if (!geminiKey) return null;
  try {
    const vec = await embedWithGemini(text, geminiKey, process.env.GENOS_EMBEDDING_MODEL);
    if (vec) return vec;
  } catch (_) {}
  return null;
}

async function tryOllamaEmbed(text, config) {
  try {
    const vec = await embedWithOllama(text, config.ollamaUrl, config.ollamaModel);
    if (vec) return vec;
  } catch (_) {}
  return null;
}

async function tryLocalTransformersEmbed(text) {
  if (process.env.GENOS_ENABLE_LOCAL_TRANSFORMERS !== 'true') return null;
  try {
    const { pipeline, env } = require('@xenova/transformers');
    env.allowLocalModels = true;
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    if (output?.data) {
      return normalizeVector(Array.from(output.data), Number(process.env.GENOS_EMBEDDING_DIMENSIONS) || 768);
    }
  } catch (_) {}
  return null;
}

async function tryProvidersInOrder(text, config) {
  const openAiResult = await tryOpenAiEmbed(text);
  if (openAiResult) return openAiResult;

  const geminiResult = await tryGeminiEmbed(text);
  if (geminiResult) return geminiResult;

  const ollamaResult = await tryOllamaEmbed(text, config);
  if (ollamaResult) return ollamaResult;

  return tryLocalTransformersEmbed(text);
}

async function embed(text) {
  const cleanText = String(text || '').trim();
  if (!cleanText) return null;
  const config = buildEmbedConfig();
  return tryProvidersInOrder(text, config);
}

async function tryRemoteRerank(query, documents, config) {
  const { endpoint, key, timeoutMs } = config;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query, documents }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined
    });
    if (response.ok) return (await response.json()).results || [];
  } catch (_) {}
  return null;
}

function computeLocalRerank(query, documents) {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  return (documents || []).map((doc) => {
    const text = String(doc?.content || doc?.summary || doc?.semantic_summary || doc?.title || '').toLowerCase();
    const matches = terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
    const rerankScore = matches / Math.max(terms.length, 1);
    return { ...doc, rerankScore };
  }).sort((a, b) => b.rerankScore - a.rerankScore);
}

async function rerank(query, documents = []) {
  const endpoint = process.env.GENOS_RERANK_ENDPOINT;
  const key = process.env.GENOS_RERANK_API_KEY || process.env.GENOS_MODEL_API_KEY;
  const timeoutMs = Number(process.env.GENOS_RERANK_TIMEOUT_MS) || 3000;
  const remoteConfig = { endpoint, key, timeoutMs };
  const remoteResult = await tryRemoteRerank(query, documents, remoteConfig);
  if (remoteResult) return remoteResult;
  return computeLocalRerank(query, documents);
}

function computeLocalRerank(query, documents) {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  return (documents || []).map((doc) => {
    const text = String(doc?.content || doc?.summary || doc?.semantic_summary || doc?.title || '').toLowerCase();
    const matches = terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
    const rerankScore = matches / Math.max(terms.length, 1);
    return { ...doc, rerankScore };
  }).sort((a, b) => b.rerankScore - a.rerankScore);
}

module.exports = { embed, cosine, rerank, normalizeVector };