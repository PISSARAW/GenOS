const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

async function run() {
  const dbPath = path.join(require('node:os').tmpdir(), `genos-lineage-types-${Date.now()}.db`);
  process.env.GENOS_DB_PATH = dbPath;
  process.env.GENOS_ADMIN_PASSWORD = 'test-only';
  const { getDatabase, closeDatabase } = require('../src/db');
  try {
    const db = await getDatabase();
    for (const nodeType of ['mitosis', 'binary_fission', 'budding', 'schizogony', 'meiosis', 'speculative_merozoite', 'lysed_schizont']) {
      await db.run('INSERT INTO lineage_nodes (id, label, node_type) VALUES (?, ?, ?)', `node-${nodeType}`, nodeType, nodeType);
    }
    const rows = await db.all('SELECT node_type FROM lineage_nodes WHERE id LIKE ? ORDER BY id', 'node-%');
    assert.equal(rows.length, 7);
    assert.deepEqual(rows.map((row) => row.node_type).sort(), ['binary_fission', 'budding', 'lysed_schizont', 'meiosis', 'mitosis', 'schizogony', 'speculative_merozoite'].sort());
    console.log('Lineage reproduction node type contract passed.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
