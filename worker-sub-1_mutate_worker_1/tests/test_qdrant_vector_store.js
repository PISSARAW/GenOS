const assert = require('assert/strict');
const { QdrantVectorStore, pointId } = require('../src/services/vectorStore');

const calls = [];
const store = new QdrantVectorStore({
  url: 'https://qdrant.example.test', apiKey: 'secret', collection: 'chunks',
  fetchFn: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => url.endsWith('/query') ? { result: { points: [{ score: 0.9, payload: { chunkId: 'chunk-a', organizationId: 'org-a', projectId: 'project-a', content: 'durable replay' } }] } } : { result: true } };
  }
});

async function main() {
  await store.upsert({ organizationId: 'org-a', projectId: 'project-a', chunk: { id: 'chunk-a', document_id: 'doc-a', chunk_index: 0, content: 'durable replay' }, vector: [0.1, 0.2] });
  const results = await store.search({ organizationId: 'org-a', projectId: 'project-a', vector: [0.1, 0.2] });
  assert.equal(results[0].chunkId, 'chunk-a');
  assert.match(pointId('chunk-a'), /^[0-9a-f-]{36}$/);
  const query = JSON.parse(calls.at(-1).options.body);
  assert.deepEqual(query.filter.must.map(item => item.match.value), ['org-a', 'project-a']);
  assert.equal(calls[0].options.headers['api-key'], 'secret');
  console.log('Qdrant vector store checks passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
