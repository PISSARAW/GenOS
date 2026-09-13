const assert = require('assert');
const os = require('os');
const path = require('path');

process.env.GENOS_DB_PATH = path.join(os.tmpdir(), `genos-genome-ops-${Date.now()}.db`);
process.env.GENOS_ADMIN_PASSWORD = 'test-admin-password-123';
process.env.GENOS_ADMIN_TOKEN = 'test-admin-token-123';

const { getDatabase, closeDatabase } = require('../src/db');
const store = require('../src/services/agentDnaStore');
const operations = require('../src/services/agentDnaOperations');

async function run() {
  const db = await getDatabase();
  const directory = path.resolve(__dirname, '../../agents/dna/fondations');
  await store.importDirectory(db, directory, {});

  const mutated = await operations.runOperation(db, {
    operation: 'mutate',
    params: { genomeId: 'EvidenceLedger', rate: 0.2, seed: 'ops-test' },
    scope: {}
  });
  assert.ok(mutated.genomeRef);
  assert.ok(mutated.contentHash.length === 64);
  const stored = await store.loadGenome(db, mutated.genomeRef);
  assert.ok(stored);
  assert.equal(stored.provenance.mutations.length, 1);

  await assert.rejects(
    operations.runOperation(db, { operation: 'unknown', params: { genomeId: 'EvidenceLedger' }, scope: {} }),
    /Unsupported genome operation/
  );

  await closeDatabase();
  console.log('Genome operations checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
