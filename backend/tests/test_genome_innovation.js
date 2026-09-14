const assert = require('assert');
const os = require('os');
const path = require('path');

process.env.GENOS_DB_PATH = path.join(os.tmpdir(), `genos-genome-innov-${Date.now()}.db`);
process.env.GENOS_ADMIN_PASSWORD = 'test-admin-password-123';
process.env.GENOS_ADMIN_TOKEN = 'test-admin-token-123';
process.env.GENOS_AGENT_DNA = '1';

const { getDatabase, closeDatabase } = require('../src/db');
const store = require('../src/services/agentDnaStore');
const innovation = require('../src/services/agentDnaInnovation');

async function run() {
  const db = await getDatabase();
  await store.importDirectory(db, path.resolve(__dirname, '../../agents/dna/fondations'), {});

  const base = await store.loadGenome(db, 'EvidenceLedger');
  const novel = innovation.detectNovelConcepts(base, ['genos_inspect', 'genos_sandbox_exec']);
  assert.deepEqual(novel, [{ locus: 'TOOL_GENOS_SANDBOX_EXEC', instruction: 'genos_sandbox_exec' }]);

  const captured = await innovation.captureCandidate(db, {
    baseGenomeRef: 'EvidenceLedger',
    name: 'EvidenceLedger-sandbox',
    concept: 'genos_sandbox_exec',
    concepts: novel,
    sourceAgentId: 'agent-innov',
    evidence: { eventType: 'WORKER_TASK_COMPLETED' },
    scope: {}
  });
  assert.ok(captured.candidateGenomeRef);

  const candidate = await store.loadGenome(db, captured.candidateGenomeRef);
  assert.ok(candidate.genes.TOOL_GENOS_SANDBOX_EXEC);

  const auto = await store.selectGenome(db, { role: 'historian' }, null);
  assert.ok(auto);
  assert.notEqual(auto.id, captured.candidateGenomeRef);

  const promoted = await innovation.promoteCandidate(db, captured.id);
  assert.equal(promoted.status, 'promoted');
  const listed = await innovation.listInnovations(db, {});
  assert.ok(listed.length >= 1);

  await closeDatabase();
  console.log('Genome innovation checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
