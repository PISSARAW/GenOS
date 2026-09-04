const assert = require('assert');
const { validateGraph } = require('./src/controllers/workflowController');
const { getDatabase, closeDatabase } = require('./src/db');

async function run() {
  const db = await getDatabase(':memory:');
  const graph = validateGraph({ nodes: [{ id: 'trigger', type: 'trigger' }, { id: 'answer' }], edges: [{ id: 'e1', source: 'trigger', target: 'answer' }] });
  assert.equal(graph.valid, true);
  assert.equal(validateGraph({ nodes: [{ id: 'a' }, { id: 'a' }], edges: [] }).valid, false);
  const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('workflows','prompts','datasets','rag_documents','integrations','releases','organizations')");
  assert.equal(tables.length, 7);
  await closeDatabase();
  console.log('Studio control-plane contracts: ok');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
