const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

process.env.GENOS_DB_PATH = path.join(os.tmpdir(), `genos-genome-ops-${Date.now()}.db`);
process.env.GENOS_ADMIN_PASSWORD = 'test-admin-password-123';
process.env.GENOS_ADMIN_TOKEN = 'test-admin-token-123';

const { getDatabase, closeDatabase } = require('../src/db');
const store = require('../src/services/agentDnaStore');
const operations = require('../src/services/agentDnaOperations');
const agentDna = require('../src/services/agentDna');
const { decodeContainer, verifySignature } = require('../src/services/agentDna/container');
const { resolveGenosBin } = require('../src/services/genosCliEnv');

function testSignatureVerification() {
  const bin = resolveGenosBin();
  const temp = os.tmpdir();
  const keyPath = path.join(temp, `genos-key-${Date.now()}.txt`);
  const signedPath = path.join(temp, `genos-signed-${Date.now()}.dna`);
  const source = path.resolve(__dirname, '../../agents/dna/fondations/preuve_evidence.dna');
  const keygen = spawnSync(bin, ['genome', 'keygen', '--out', keyPath, '--force'], { encoding: 'utf8' });
  assert.equal(keygen.status, 0, keygen.stderr);
  const sign = spawnSync(bin, ['genome', 'sign', '--in', source, '--out', signedPath, '--key', keyPath, '--force'], { encoding: 'utf8' });
  assert.equal(sign.status, 0, sign.stderr);

  const model = agentDna.decodeFile(signedPath);
  assert.equal(model.signed, true);
  assert.equal(model.signatureValid, true);

  const { sections } = decodeContainer(fs.readFileSync(signedPath));
  sections.set('SIGN', Buffer.alloc(64));
  const check = verifySignature(sections);
  assert.equal(check.signed, true);
  assert.equal(check.valid, false);

  fs.rmSync(keyPath, { force: true });
  fs.rmSync(signedPath, { force: true });
  console.log('AgentDNA JS signature checks passed.');
}

async function run() {
  testSignatureVerification();
  const db = await getDatabase();
  const directory = path.resolve(__dirname, '../../agents/dna/fondations');
  await store.importDirectory(db, directory, {});

  const mutated = await operations.runOperation(db, {
    operation: 'mutate',
    params: { genomeId: 'EvidenceLedger', rate: 0.2, seed: 'ops-test' },
    scope: {}
  });
  assert.ok(mutated.genomeRef);
  assert.equal(mutated.contentHash.length, 64);
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
