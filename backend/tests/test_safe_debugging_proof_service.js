const assert = require('assert');
const proof = require('./src/services/safeDebuggingProofService');

async function run() {
  const result = await proof.readLatest();
  assert.equal(result.available, true);
  assert.equal(result.running, false);
  assert.equal(proof.validEvidence(result.evidence), true);
  assert.equal(result.evidence.execution?.live, false, 'the fixture remains deterministic even when executed by the backend');
  console.log('Safe debugging proof service checks passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
