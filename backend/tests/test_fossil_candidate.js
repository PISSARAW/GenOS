const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.GENOS_AGENT_DNA = '1';
process.env.GENOS_ADMIN_PASSWORD = 'fossil-candidate-suite-only';
process.env.GENOS_FOSSIL_ARTIFACT = '0';

const { getDatabase, closeDatabase } = require('../src/db');
const store = require('../src/services/agentDnaStore');
const fossilization = require('../src/services/fossilizationService');
const innovation = require('../src/services/agentDnaInnovation');

async function run() {
  const dbPath = path.join(os.tmpdir(), `genos_fossil_candidate_${Date.now()}.db`);
  process.env.GENOS_DB_PATH = dbPath;
  const db = await getDatabase();
  try {
    await store.importDirectory(db, path.resolve(__dirname, '../../agents/dna/fondations'), {});
    const fossil = fossilization.buildFossilRecord({
      lineageId: 'extinct-agent',
      reason: 'validated dead end',
      hardParts: ['genos_sandbox_exec'],
      mineralPayload: { contracts: ['read-only-audit'] }
    });
    const candidate = await innovation.captureFromFossil({ db, record: fossil, baseGenomeRef: 'EvidenceLedger', integrityVerified: true });
    assert.equal(candidate.status, 'candidate');
    const row = await db.get('SELECT status FROM agent_genomes WHERE id = ?', candidate.candidateGenomeRef);
    assert.equal(row.status, 'candidate');
    console.log('Fossil candidate extraction passed.');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(`${dbPath}${suffix}`); } catch (_) {}
    }
  }
}

run().catch((error) => {
  console.error('Fossil candidate failure:', error);
  process.exit(1);
});
