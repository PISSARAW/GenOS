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
  let adjusted = vec;
  if (targetDim && vec.length !== targetDim) {
    if (vec.length > targetDim) {
      adjusted = vec.slice(0, targetDim);
    } else {
      adjusted = new Array(targetDim).fill(0);
      for (let i = 0; i < vec.length; i++) adjusted[i] = vec[i];
    }
  }
  let sum = 0;
  for (let i = 0; i < adjusted.length; i++) sum += adjusted[i] * adjusted[i];
  const norm = Math.sqrt(sum);
  if (norm > 0) {
    return adjusted.map(v => v / norm);
  }
  return adjusted;
}

async function embedWithOpenAi(text, apiKey, endpoint, model) {
  const url = endpoint || 'https://api.openai.com/v1/embeddings';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model: model || 'text-embedding-3-small', input: text }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const rawVec = payload?.data?.[0]?.embedding || null;
  return normalizeVector(rawVec, 768);
}

async function embedWithOllama(text, rawUrl, model) {
  const base = rawUrl.replace(/\/+$/, '');
  // Try modern /api/embed first
  try {
    const embedUrl = base.endsWith('/api/embed') ? base : `${base}/api/embed`;
    const response = await fetch(embedUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined
    });
    if (response.ok) {
      const payload = await response.json();
      const rawVec = payload?.embeddings?.[0] || null;
      if (rawVec) return normalizeVector(rawVec, 768);
    }
  } catch (_) {}

  // Fallback to legacy /api/embeddings
  try {
    const legacyUrl = base.endsWith('/api/embeddings') ? base : `${base}/api/embeddings`;
    const response = await fetch(legacyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined
    });
    if (response.ok) {
      const payload = await response.json();
      const rawVec = payload?.embedding || null;
      if (rawVec) return normalizeVector(rawVec, 768);
    }
  } catch (_) {}

  return null;
}

async function embed(text) {
  const cleanText = String(text || '').trim();
  if (!cleanText) return null;

  // 1. Check for remote OpenAI/Gemini compatible embedding provider
  const openAiKey = process.env.GENOS_EMBEDDING_API_KEY || process.env.OPENAI_API_KEY;
  if (process.env.GENOS_EMBEDDING_PROVIDER === 'openai' && openAiKey) {
    try {
      const vec = await embedWithOpenAi(
        cleanText,
        openAiKey,
        process.env.GENOS_EMBEDDING_URL,
        process.env.GENOS_EMBEDDING_MODEL
      );
      if (vec) return vec;
    } catch (_) {}
  }

  // 2. Ollama / Local REST embedding provider
  const ollamaUrl = process.env.GENOS_EMBEDDING_URL ||
    process.env.GENOS_OLLAMA_URL ||
    process.env.OLLAMA_HOST ||
    'http://127.0.0.1:11434';
  const ollamaModel = process.env.GENOS_EMBEDDING_MODEL ||
    process.env.OLLAMA_EMBEDDING_MODEL ||
    'nomic-embed-text';

  try {
    const vec = await embedWithOllama(cleanText, ollamaUrl, ollamaModel);
    if (vec) return vec;
  } catch (_) {}

  // 3. In-process Xenova fallback if requested/available
  if (process.env.GENOS_ENABLE_LOCAL_TRANSFORMERS === 'true') {
    try {
      const { pipeline, env } = require('@xenova/transformers');
      env.allowLocalModels = true;
      const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
      const output = await extractor(cleanText, { pooling: 'mean', normalize: true });
      if (output?.data) {
        return normalizeVector(Array.from(output.data), 768);
      }
    } catch (_) {}
  }

  return null;
}

async function rerank(query, documents = []) {
  const endpoint = process.env.GENOS_RERANK_ENDPOINT;
  const key = process.env.GENOS_RERANK_API_KEY || process.env.GENOS_MODEL_API_KEY;
  if (endpoint && key) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ query, documents }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined
      });
      if (response.ok) return (await response.json()).results || [];
    } catch (_) {}
  }
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  return (documents || []).map((doc) => {
    const text = String(doc?.content || doc?.summary || doc?.semantic_summary || doc?.title || '').toLowerCase();
    const matches = terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
    const rerankScore = matches / Math.max(terms.length, 1);
    return { ...doc, rerankScore };
  }).sort((a, b) => b.rerankScore - a.rerankScore);
}

module.exports = { embed, cosine, rerank, normalizeVector };
