function cosine(a = [], b = []) { const n = Math.min(a.length, b.length); let dot = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return aa && bb ? dot / (Math.sqrt(aa) * Math.sqrt(bb)) : 0; }

async function embed(text) {
  try {
    const rawUrl = (process.env.GENOS_EMBEDDING_URL || process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const endpoint = rawUrl.endsWith('/embeddings') ? rawUrl : `${rawUrl}/api/embeddings`;
    const model = process.env.GENOS_EMBEDDING_MODEL || 'nomic-embed-text';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined
    });
    if (!response.ok) {
      console.warn(`[EmbeddingProvider] Provider HTTP ${response.status}:`, await response.text());
      return null;
    }
    const payload = await response.json();
    const vec = payload.embedding || null;
    if (vec && Array.isArray(vec)) {
      let sum = 0;
      for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
      const norm = Math.sqrt(sum);
      if (norm > 0) {
        for (let i = 0; i < vec.length; i++) vec[i] /= norm;
      }
    }
    return vec;
  } catch (e) {
    // Graceful fallback to deterministic vectorizer
    return null;
  }
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
module.exports = { embed, cosine, rerank };
