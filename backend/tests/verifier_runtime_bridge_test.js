'use strict';

const assert = require('node:assert');
const B = require('../src/services/epistemic/verifierRuntimeBridge');

// ---- buildVerifierWorker ----

const antigen = {
  id: 'ag-1',
  claim: { text: 'Le test passe' },
  epitopes: { evidence: { digest: 'abc123' } },
};

const verifier = {
  type: 'testResult',
  id: 'v-1',
  strategy: ['reproduire', 'comparer'],
};

const worker = B.buildVerifierWorker(antigen, verifier);
assert.strictEqual(worker.agentId, 'verifier-testResult-v-1');
assert.strictEqual(worker.role, 'verifier');
assert.strictEqual(worker.pipelineStage, 0);
assert.ok(worker.prompt.includes('VÉRIFICATEUR: testResult'));
assert.ok(worker.prompt.includes('reproduire'));

// ---- buildVerifierPrompt ----

const prompt = B.buildVerifierPrompt(antigen, verifier);
assert.ok(prompt.includes('Antigène: ag-1'));
assert.ok(prompt.includes('Claim: Le test passe'));

// ---- executeVerifierWorkers (async) ----

async function run() {
  const verifiers = [
    { type: 'testResult', strategy: ['reproduire'] },
    { type: 'counterexample', strategy: ['chercher contre-exemple'] },
  ];
  const result = await B.executeVerifierWorkers(antigen, verifiers);
  assert.ok(['verified', 'refuted', 'inconclusive'].includes(result.status));
  assert.strictEqual(result.results.length, 2);
  assert.ok(result.summary.verified >= 0);
}

run().then(() => console.log('OK verifierRuntimeBridge')).catch((err) => {
  console.error(err);
  process.exit(1);
});
