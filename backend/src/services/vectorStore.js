const crypto = require('crypto');

function pointId(value) {
  const hash = crypto.createHash('sha256').update(String(value)).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

class QdrantVectorStore {
  constructor({ url, apiKey, collection = 'genos_chunks', fetchFn = fetch }) {
    this.url = String(url || '').replace(/\/$/, '');
    this.apiKey = apiKey;
    this.collection = collection;
    this.fetch = fetchFn;
  }

  headers() {
    return { 'Content-Type': 'application/json', ...(this.apiKey ? { 'api-key': this.apiKey } : {}) };
  }

  async request(path, body, method = 'POST') {
    const response = await this.fetch(`${this.url}${path}`, { method, headers: this.headers(), body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok && response.status !== 409) throw new Error(`Qdrant returned HTTP ${response.status}.`);
    return response.status === 409 ? null : response.json();
  }

  async ensureCollection(dimensions) {
    if (!dimensions) return;
    await this.request(`/collections/${encodeURIComponent(this.collection)}`, { vectors: { size: dimensions, distance: 'Cosine' } }, 'PUT');
  }

  async upsert({ organizationId, projectId, chunk, vector }) {
    if (!Array.isArray(vector) || !vector.length) return;
    await this.ensureCollection(vector.length);
    await this.request(`/collections/${encodeURIComponent(this.collection)}/points`, {
      points: [{ id: pointId(chunk.id), vector, payload: { chunkId: chunk.id, documentId: chunk.document_id, content: chunk.content, chunkIndex: chunk.chunk_index, organizationId, projectId } }]
    }, 'PUT');
  }

  async search({ organizationId, projectId, vector, limit = 20 }) {
    if (!Array.isArray(vector) || !vector.length) return [];
    const payload = await this.request(`/collections/${encodeURIComponent(this.collection)}/points/query`, {
      query: vector,
      limit,
      with_payload: true,
      filter: { must: [
        { key: 'organizationId', match: { value: organizationId } },
        { key: 'projectId', match: { value: projectId } }
      ] }
    });
    const points = payload?.result?.points || payload?.result || [];
    return points.map(point => ({ ...point.payload, vectorScore: point.score || 0, score: point.score || 0 }));
  }
}

function configuredStore() {
  if (process.env.GENOS_VECTOR_STORE !== 'qdrant' || !process.env.GENOS_QDRANT_URL) return null;
  return new QdrantVectorStore({ url: process.env.GENOS_QDRANT_URL, apiKey: process.env.GENOS_QDRANT_API_KEY, collection: process.env.GENOS_QDRANT_COLLECTION || 'genos_chunks' });
}

module.exports = { QdrantVectorStore, configuredStore, pointId };
