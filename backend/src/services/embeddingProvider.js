function cosine(a = [], b = []) { const n = Math.min(a.length, b.length); let dot = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return aa && bb ? dot / (Math.sqrt(aa) * Math.sqrt(bb)) : 0; }

async function embed(text) {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', prompt: text })
    });
    if (!response.ok) {
      console.error(`Ollama error: HTTP ${response.status}`, await response.text());
      return null;
    }
    const payload = await response.json();
    const vec = payload.embedding || null;
    if (vec) {
      let sum = 0;
      for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
      const norm = Math.sqrt(sum);
      if (norm > 0) {
        for (let i = 0; i < vec.length; i++) vec[i] /= norm;
      }
    }
    return vec;
  } catch (e) {
    console.error("Embedding provider error:", e);
    return null;
  }
}

async function rerank(query, documents) { const endpoint = process.env.GENOS_RERANK_ENDPOINT; const key = process.env.GENOS_RERANK_API_KEY || process.env.GENOS_MODEL_API_KEY; if (endpoint && key) { const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ query, documents }) }); if (response.ok) return (await response.json()).results || []; } const terms = query.toLowerCase().split(/\s+/).filter(Boolean); return documents.map((doc) => ({ ...doc, rerankScore: terms.reduce((score, term) => score + (doc.content.toLowerCase().includes(term) ? 1 : 0), 0) / Math.max(terms.length, 1) })).sort((a, b) => b.rerankScore - a.rerankScore); }
module.exports = { embed, cosine, rerank };
