'use strict';

const assert = require('node:assert');

if (!process.env.GENOS_EPISTEMIC_RECEIPT_SECRET) {
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'test-secret-for-verifier-execution';
}

const V = require('../src/services/epistemic/verifierExecutionService');

const antigen = {
  id: 'ag-1',
  claim: 'X > 3',
  epitopes: {
    evidence: { kind: 'test_result', digest: 'sha256:abc' },
    assumptions: ['X is an integer'],
    validityDomain: { domain: 'math' },
  },
  producer: { model: 'test-model' },
};

const verifier = {
  type: 'testResult',
  strategy: ['isoler le test', 'reproduire', 'mesurer couverture'],
  affinity: 0.8,
};

async function run() {
  const result = await V.executeVerifier(antigen, verifier, {});
  assert.ok(result.status === 'verified' || result.status === 'refuted' || result.status === 'inconclusive');
  assert.ok(result.receipt);
  assert.ok(result.receipt.evidenceDigest || result.receipt.signature, 'receipt devrait avoir un digest ou une signature');
  assert.strictEqual(result.resultId, 'ag-1');
  assert.strictEqual(result.evidenceDigest, 'sha256:abc');
  assert.ok(result.verifierDigest.startsWith('sha256:'), 'verifierDigest doit venir du trust registry');
  assert.strictEqual(result.receipt.verifierDigest, result.verifierDigest);
  assert.ok(result.executedAt);

  const verifiers = [
    { type: 'testResult', strategy: ['reproduire'], affinity: 0.7 },
    { type: 'counterexample', strategy: ['chercher contre-exemple'], affinity: 0.6 },
  ];

  const weakAntigen = {
    id: 'ag-weak',
    claim: 'Y est vrai',
    epitopes: { evidence: { kind: 'observation' } },
    producer: { model: 'test-model' },
  };
  const results = await V.executeVerifiers(weakAntigen, verifiers, {});
  assert.strictEqual(results.status, 'refuted', 'counterexample verifier should refute weak antigen');
  assert.strictEqual(results.results.length, 2);
  assert.strictEqual(results.summary.refuted, 1);

  const noVerifier = await V.executeVerifiers(antigen, [], {});
  assert.strictEqual(noVerifier.status, 'no_verifier');

  const noAntigen = await V.executeVerifier(null, verifier, {});
  assert.strictEqual(noAntigen.status, 'inconclusive');

  console.log('OK verifierExecutionService');
}

run().catch(err => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
