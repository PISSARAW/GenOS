const { pipeline } = require('@xenova/transformers');

function cosine(a = [], b = []) { const n = Math.min(a.length, b.length); let dot = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return aa && bb ? dot / (Math.sqrt(aa) * Math.sqrt(bb)) : 0; }

let embedderPipeline = null;

async function getEmbedder() {
  if (!embedderPipeline) {
    // Lazy-load to avoid blocking server boot. Downloads quantized ONNX model automatically if not cached.
    embedderPipeline = await pipeline('feature-extraction', 'Xenova/nomic-embed-text-v1.5.quantized');
  }
  return embedderPipeline;
}

async function embed(text) {
  try {
    const embedder = await getEmbedder();
    const output = await embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch (e) {
    console.error("ONNX Embedding provider error:", e);
    return null;
  }
}

async function rerank(query, documents) { const endpoint = process.env.GENOS_RERANK_ENDPOINT; const key = process.env.GENOS_RERANK_API_KEY || process.env.GENOS_MODEL_API_KEY; if (endpoint && key) { const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ query, documents }) }); if (response.ok) return (await response.json()).results || []; } const terms = query.toLowerCase().split(/\s+/).filter(Boolean); return documents.map((doc) => ({ ...doc, rerankScore: terms.reduce((score, term) => score + (doc.content.toLowerCase().includes(term) ? 1 : 0), 0) / Math.max(terms.length, 1) })).sort((a, b) => b.rerankScore - a.rerankScore); }
module.exports = { embed, cosine, rerank };
